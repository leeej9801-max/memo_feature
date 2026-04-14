import os
import sys
from sqlalchemy import text

# Add project root to path
sys.path.append(os.getcwd())

from database import engine

def migrate():
    print("Checking for is_acknowledged column...")
    with engine.connect() as conn:
        try:
            # Check if column exists (PostgreSQL syntax)
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='approval_log' AND column_name='is_acknowledged'"))
            if not result.fetchone():
                print("Column 'is_acknowledged' missing. Adding it...")
                conn.execute(text("ALTER TABLE approval_log ADD COLUMN is_acknowledged BOOLEAN DEFAULT FALSE"))
                conn.commit()
                print("Column added successfully.")
            else:
                print("Column 'is_acknowledged' already exists.")
        except Exception as e:
            print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
