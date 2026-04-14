"""
auth_router.py - Google OAuth 및 세션 라우터
"""

import os
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session, joinedload
from authlib.integrations.starlette_client import OAuth

from datetime import datetime
from database import SessionLocal
from dependencies import get_db
from models import UserAccount, Company, RoleCode, UserInvite, FactCandidate, ApprovalLog, KPIFact

router = APIRouter(prefix="/auth", tags=["Auth"])

oauth = OAuth()
oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID", ""),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET", ""),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile'
    }
)

@router.get("/login/google")
async def login_google(request: Request, invite_token: str = None):
    if not os.getenv("GOOGLE_CLIENT_ID"):
        raise HTTPException(status_code=500, detail="Google OAuth is not configured")
    
    # 초대 토큰이 있으면 세션에 저장하여 콜백에서 참조 가능하게 함
    if invite_token:
        request.session['invite_token'] = invite_token
        
    redirect_uri = "http://localhost:8000/auth/callback" # 고정하여 불일치 방지
    return await oauth.google.authorize_redirect(request, redirect_uri)

@router.get("/callback")
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    try:
        # 1. Google OAuth 인증
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get('userinfo')
        if not user_info:
            user_info = await oauth.google.parse_id_token(request, token)
            
        email = user_info.get("email")
        name = user_info.get("name", "Unknown")
        
        # 2. 임시: 초기 tenant_admin 시드 로직
        if email == "leeej9801@gmail.com":
            user = db.query(UserAccount).filter(UserAccount.email == email).first()
            if not user:
                company = db.query(Company).filter(Company.name == "Initial Tenant").first()
                if not company:
                    company = Company(name="Initial Tenant")
                    db.add(company)
                    db.flush()
                user = UserAccount(company_id=company.id, email=email, name=name, role_code=RoleCode.tenant_admin)
                db.add(user)
                db.commit()
            
            request.session['user_id'] = str(user.id)
            request.session['company_id'] = str(user.company_id)
            request.session['email'] = user.email
            request.session['role_code'] = user.role_code.value
            return RedirectResponse(url="http://localhost:5173")
            
        # 3. 초대 기반 가입/로그인 로직
        invite_token = request.session.pop('invite_token', None)
        user = db.query(UserAccount).filter(UserAccount.email == email).first()
        
        if not user:
            # 신규 가입 (초대장 필수)
            if invite_token:
                invite = db.query(UserInvite).filter(UserInvite.invite_token == invite_token, UserInvite.status == "pending").first()
            else:
                invite = db.query(UserInvite).filter(UserInvite.email == email, UserInvite.status == "pending").first()
                
            if not invite:
                raise HTTPException(status_code=403, detail="Unregistered email. You need an invitation.")
            
            # 사용자 계정 생성
            user = UserAccount(
                company_id=invite.company_id,
                department_id=invite.department_id,
                email=email,
                name=name,
                role_code=RoleCode.data_entry # 기본 Role
            )
            db.add(user)
            db.flush()
            
            # 초대 상태 업데이트
            invite.status = "accepted"
            
            # 배정 자동화: 해당 부서의 모든 지표를 이 유저에게 배정
            if invite.department_id:
                facts = db.query(FactCandidate).filter(
                    FactCandidate.company_id == invite.company_id,
                    FactCandidate.department_id == invite.department_id
                ).all()
                for f in facts:
                    f.assigned_user_id = user.id
            
            db.commit()
            
            # 0) Enum 깨짐 방지: 잘못된 client_user를 data_entry로 강제 업데이트 (로그인 시점)
            from sqlalchemy import text
            db.execute(text("UPDATE user_account SET role_code = 'data_entry' WHERE role_code = 'client_user'"))
            db.commit()

        request.session['user_id'] = str(user.id)
        request.session['company_id'] = str(user.company_id)
        request.session['email'] = user.email
        request.session['role_code'] = user.role_code.value

        return RedirectResponse(url="http://localhost:5173")
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/logout")
async def logout(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get('company_id')
    if company_id:
        try:
            # 테스트/데모용: 로그아웃 시 현재 테넌트의 입력 데이터 리셋
            db.query(ApprovalLog).filter(ApprovalLog.company_id == company_id).delete()
            db.query(KPIFact).filter(KPIFact.company_id == company_id).delete()
            db.query(FactCandidate).filter(FactCandidate.company_id == company_id).delete()
            db.commit()
        except:
            db.rollback()
            
    request.session.clear()
    return {"message": "Logged out and data reset successfully"}

@router.get("/me")
async def get_me(request: Request, db: Session = Depends(get_db)):
    user_id = request.session.get('user_id')
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    user = db.query(UserAccount).filter(UserAccount.id == user_id).first()
    if not user:
        request.session.clear()
        raise HTTPException(status_code=401, detail="User not found")
        
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role_code": user.role_code.value,
        "company_id": str(user.company_id)
    }

# 개발용 Mock 세션 (숨김 패널용)
@router.post("/dev/mock_login")
async def mock_login(email: str, request: Request, db: Session = Depends(get_db)):
    user = db.query(UserAccount).filter(UserAccount.email == email).first()
    if not user:
        if email == "leeej9801@gmail.com":
            company = db.query(Company).filter(Company.name == "Initial Tenant").first()
            if not company:
                company = Company(name="Initial Tenant")
                db.add(company)
                db.flush()
            user = UserAccount(company_id=company.id, email=email, name="Mock Admin", role_code=RoleCode.tenant_admin)
            db.add(user)
            db.commit()
        else:
            raise HTTPException(status_code=404, detail="Mock User not found")
            
    request.session['user_id'] = str(user.id)
    request.session['company_id'] = str(user.company_id)
    request.session['email'] = user.email
    request.session['role_code'] = user.role_code.value
    
    return {"message": "Logged in via mock"}

@router.get("/admin/invites")
async def list_invites(request: Request, db: Session = Depends(get_db)):
    role = request.session.get('role_code')
    company_id = request.session.get('company_id')
    if role != RoleCode.tenant_admin.value:
        raise HTTPException(status_code=403, detail="Tenant admin only")
    
    invites = db.query(UserInvite).filter(UserInvite.company_id == company_id).all()
    return {
        "invites": [
            {
                "id": str(i.id),
                "email": i.email,
                "status": i.status,
                "token": i.invite_token,
                "issue_group_code": i.issue_group_code,
                "created_at": i.created_at
            } for i in invites
        ]
    }

from pydantic import BaseModel
class InviteRequest(BaseModel):
    email: str
    issue_group_code: str = None
    department_id: str = None
    department_name: str = None # 추가
    metric_id: str = None

import uuid as uuid_pkg

@router.post("/admin/invites")
async def create_invite(req: InviteRequest, request: Request, db: Session = Depends(get_db)):
    role = request.session.get('role_code')
    company_id = request.session.get('company_id')
    if role != RoleCode.tenant_admin.value:
        raise HTTPException(status_code=403, detail="Tenant admin only")

    # 기존 초대 확인
    invite = db.query(UserInvite).filter(UserInvite.company_id == company_id, UserInvite.email == req.email).first()
    token = str(uuid_pkg.uuid4())
    
    # 부서명 기반 처리
    target_dept_id = req.department_id
    if req.department_name and not target_dept_id:
        # 부서 없으면 생성
        from models import Department
        dept = db.query(Department).filter(Department.company_id == company_id, Department.name == req.department_name).first()
        if not dept:
            dept = Department(company_id=company_id, name=req.department_name, issue_group_code=req.issue_group_code or "CSV")
            db.add(dept)
            db.flush()
        target_dept_id = str(dept.id)

    if invite:
        if invite.status == "accepted":
            raise HTTPException(status_code=400, detail="User already accepted invitation")
        invite.issue_group_code = req.issue_group_code
        invite.department_id = target_dept_id
        invite.metric_id = req.metric_id
        invite.invite_token = token
        invite.created_at = datetime.utcnow()
    else:
        invite = UserInvite(
            company_id=company_id,
            email=req.email,
            issue_group_code=req.issue_group_code,
            department_id=target_dept_id,
            metric_id=req.metric_id,
            invite_token=token
        )
        db.add(invite)
    
    db.commit()
    
    # 프론트엔드 URL 기반의 초대 링크 생성
    invite_url = f"http://localhost:5173/?token={token}"
    return {
        "message": "Invited", 
        "id": str(invite.id), 
        "invite_url": invite_url,
        "email_sent": True
    }

@router.delete("/admin/invites/{invite_id}")
async def delete_invite(invite_id: str, request: Request, db: Session = Depends(get_db)):
    role = request.session.get('role_code')
    company_id = request.session.get('company_id')
    if role != RoleCode.tenant_admin.value:
        raise HTTPException(status_code=403, detail="Tenant admin only")

    invite = db.query(UserInvite).filter(UserInvite.id == invite_id, UserInvite.company_id == company_id).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
        
    db.delete(invite)
    db.commit()
    return {"message": "Invite deleted"}

@router.get("/admin/users")
async def list_users(request: Request, db: Session = Depends(get_db)):
    role = request.session.get('role_code')
    company_id = request.session.get('company_id')
    if role != RoleCode.tenant_admin.value:
        raise HTTPException(status_code=403, detail="Tenant admin only")

    users = db.query(UserAccount).options(joinedload(UserAccount.department)).filter(UserAccount.company_id == company_id).all()
    return {
        "users": [
            {
                "id": str(u.id),
                "email": u.email,
                "name": u.name,
                "role_code": u.role_code.value,
                "department": u.department.name if u.department else "소속 없음",
                "is_active": u.is_active
            } for u in users
        ]
    }

@router.delete("/admin/users/{user_id}")
async def revoke_user(user_id: str, request: Request, db: Session = Depends(get_db)):
    role = request.session.get('role_code')
    company_id = request.session.get('company_id')
    if role != RoleCode.tenant_admin.value:
        raise HTTPException(status_code=403, detail="Tenant admin only")

    user = db.query(UserAccount).filter(UserAccount.id == user_id, UserAccount.company_id == company_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Prevent self-deletion if needed, but for now simple
    db.delete(user)
    db.commit()
    return {"message": "User access revoked"}

