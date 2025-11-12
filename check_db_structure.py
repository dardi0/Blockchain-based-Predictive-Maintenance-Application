#!/usr/bin/env python3
"""
Database yapısını kontrol et
"""

import sqlite3
import os

def check_database_structure():
    """Mevcut database'lerin yapısını kontrol et"""
    
    db_files = [f for f in os.listdir('.') if f.endswith('.db')]
    
    if not db_files:
        print("❌ Hiç .db dosyası bulunamadı!")
        return
    
    print(f"📊 Bulunan database dosyaları: {db_files}")
    print()
    
    for db_file in db_files:
        print(f"🗄️ Database: {db_file}")
        try:
            conn = sqlite3.connect(db_file)
            cursor = conn.cursor()
            
            # Tabloları listele
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            
            if tables:
                print(f"   📋 Tablolar: {[t[0] for t in tables]}")
                
                # Her tablo için şemayı göster
                for table in tables:
                    table_name = table[0]
                    cursor.execute(f"PRAGMA table_info({table_name});")
                    columns = cursor.fetchall()
                    print(f"   📝 {table_name} tablosu:")
                    for col in columns:
                        print(f"      - {col[1]} ({col[2]})")
                    
                    # Kayıt sayısını göster
                    cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
                    count = cursor.fetchone()[0]
                    print(f"      📊 Toplam kayıt: {count}")
                    print()
            else:
                print("   ⚠️ Hiç tablo yok!")
            
            conn.close()
            
        except Exception as e:
            print(f"   ❌ Hata: {e}")
        
        print("-" * 50)

if __name__ == "__main__":
    check_database_structure()
