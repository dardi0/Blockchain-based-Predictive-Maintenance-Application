#!/usr/bin/env python3
"""
Database kayıtlarını kontrol et
"""

from database_manager import PdMDatabaseManager

def check_records():
    """Kayıtları kontrol et"""
    db = PdMDatabaseManager()
    
    # Kayıtları getir
    records = db.get_sensor_data(limit=10)
    print(f"📊 Database kayıt sayısı: {len(records)}")
    print()
    
    for record in records:
        prediction_text = "Normal" if record['prediction'] == 0 else "Arıza" if record['prediction'] == 1 else "N/A"
        # prediction_probability'yi güvenli şekilde float'a çevir
        prob_value = record['prediction_probability']
        prob_text = "N/A"
        
        if prob_value is not None:
            try:
                if isinstance(prob_value, (int, float)):
                    prob_text = f"{prob_value:.2%}"
                elif isinstance(prob_value, str):
                    prob_text = f"{float(prob_value):.2%}"
                elif isinstance(prob_value, bytes):
                    # Binary data'yı float olarak yorumla
                    import struct
                    if len(prob_value) == 8:  # double (8 bytes)
                        prob_float = struct.unpack('d', prob_value)[0]
                        prob_text = f"{prob_float:.2%}"
                    elif len(prob_value) == 4:  # float (4 bytes)
                        prob_float = struct.unpack('f', prob_value)[0]
                        prob_text = f"{prob_float:.2%}"
                    else:
                        prob_text = f"Binary({len(prob_value)} bytes)"
            except (ValueError, struct.error) as e:
                prob_text = f"Error: {type(prob_value).__name__}"
        bc_status = "✅" if record['blockchain_success'] else "❌"
        
        print(f"🆔 ID: {record['id']}")
        print(f"   ⏰ Zaman: {record['created_at']}")
        print(f"   🎯 Tahmin: {prediction_text} ({prob_text})")
        print(f"   🔗 Blockchain: {bc_status}")
        print(f"   🤖 Makine: {record['machine_type']}")
        print()
    
    # İstatistikler
    stats = db.get_statistics()
    print("📈 İstatistikler:")
    print(f"   📝 Toplam: {stats['total_records']}")
    print(f"   🎯 Tahminler: {stats['prediction_distribution']}")
    print(f"   🔧 Makineler: {stats['machine_type_distribution']}")

if __name__ == "__main__":
    check_records()
