"""Database module - simple and clean"""
import os
from dotenv import load_dotenv

load_dotenv()

# Try to import supabase, but don't fail if it's not installed
try:
    from supabase import create_client
    
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SECRET_KEY", "").strip()
    
    if url and key:
        supabase = create_client(url, key)
    else:
        supabase = None
except Exception as e:
    print(f"Supabase error: {e}")
    supabase = None
