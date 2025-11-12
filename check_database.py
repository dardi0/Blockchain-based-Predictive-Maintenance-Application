#!/usr/bin/env python3
"""
PdMDatabase.database yapısını kontrol et
"""

import sqlite3
import os
from pathlib import Path

def check_database_structure():
    """Database yapısını kontrol et"""
    db_path = Path("PdMDatabase") / "PdMDatabase"
    
    if not db_path.exists():
        print(f"❌ Database dosyası bulunamadı: {db_path}")
        return False
    
    print(f"📊 Database kontrol ediliyor: {db_path}")
    print(f"📁 Dosya boyutu: {db_path.stat().st_size} bytes")
    print()
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # Tabloları listele
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        print(f"📋 Bulunan tablolar ({len(tables)} adet):")
        for table in tables:
            table_name = table[0]
            print(f"   🔹 {table_name}")
            
            # Tablo yapısını göster
            cursor.execute(f"PRAGMA table_info({table_name});")
            columns = cursor.fetchall()
            
            print(f"      Kolonlar ({len(columns)} adet):")
            for col in columns:
                col_id, col_name, col_type, not_null, default_val, is_pk = col
                pk_marker = " (PK)" if is_pk else ""
                null_marker = " NOT NULL" if not_null else ""
                default_marker = f" DEFAULT {default_val}" if default_val else ""
                print(f"        - {col_name}: {col_type}{pk_marker}{null_marker}{default_marker}")
            
            # Kayıt sayısını göster
            cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
            count = cursor.fetchone()[0]
            print(f"      📊 Kayıt sayısı: {count}")
            print()
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Database hatası: {e}")
        return False

if __name__ == "__main__":
    check_database_structure()
