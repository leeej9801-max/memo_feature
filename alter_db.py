import psycopg2
import os

CONN_STR = "postgresql://postgres:esg1234@localhost:5432/esg_platform"

def run():
    conn = psycopg2.connect(CONN_STR)
    cur = conn.cursor()
    try:
        # Add department_id to user_account
        cur.execute("ALTER TABLE user_account ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES department(id);")
        # Add assigned_user_id to fact_candidate
        cur.execute("ALTER TABLE fact_candidate ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES user_account(id);")
        conn.commit()
        print("DB Altered successfully")
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    run()
