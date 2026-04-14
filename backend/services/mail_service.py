import os
import smtplib
from email.message import EmailMessage
import logging
from typing import Tuple

logger = logging.getLogger(__name__)

def send_invite_email_sync(to_email: str, invite_url: str, dept_name: str = None) -> Tuple[bool, str]:
    """
    SMTP를 통해 실제 초대 이메일을 발송합니다.
    Returns: (성공여부, 실패 시 에러상세문구)
    """
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USERNAME")
    smtp_pass = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM_EMAIL", smtp_user)

    if not smtp_user or not smtp_pass:
        msg = "SMTP env missing. Invite link created only."
        logger.warning(f"{msg}: {to_email}")
        return False, msg

    msg = EmailMessage()
    msg['Subject'] = "[ESG 관리 플랫폼] 새로운 지표 담당자로 초대되었습니다."
    msg['From'] = smtp_from
    msg['To'] = to_email

    dept_info = f"부서: {dept_name}" if dept_name else "부서: 미지정"
    
    content = f"""안녕하세요,

ESG 관리 플랫폼에 지표 담당자로서 추가되셨습니다.
{dept_info}

아래 링크를 클릭하여 비밀번호를 설정하고 플랫폼에 접속해 주세요.
초대 링크: {invite_url}

본 이메일은 시스템 발송 메일입니다. 
"""
    msg.set_content(content)

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        logger.info(f"초대 이메일 발송 성공: {to_email}")
        return True, ""
    except smtplib.SMTPAuthenticationError:
        err = "SMTP Authentication Failed: Please check if you are using Google App Password and correct username."
        logger.error(err)
        return False, err
    except Exception as e:
        err = f"SMTP Send Error: {str(e)}"
        logger.error(err)
        return False, err
