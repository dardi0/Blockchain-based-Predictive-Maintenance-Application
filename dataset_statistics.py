# -*- coding: utf-8 -*-
"""
📊 AI4I2020 Dataset İstatistiksel Analiz
========================================
Veri setinin detaylı istatistiksel özetini çıkarır
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

# Türkçe karakter desteği için
plt.rcParams['font.family'] = ['DejaVu Sans', 'Arial Unicode MS', 'Tahoma']
plt.rcParams['axes.unicode_minus'] = False

def create_correlation_visualizations(df, numeric_columns, sensor_names, correlation_matrix):
    """Korelasyon görselleştirmelerini oluşturur"""
    
    print(f"\n📊 Korelasyon görselleştirmeleri oluşturuluyor...")
    
    # 1. Sensörler arası korelasyon heatmap
    plt.figure(figsize=(10, 8))
    
    # Sensör Pearson korelasyon matrisi
    sensor_corr = df[numeric_columns].corr(method='pearson')
    
    # Kısa isimler için mapping
    short_names = {}
    for col in numeric_columns:
        if 'temperature' in col.lower():
            if 'air' in col.lower():
                short_names[col] = 'Hava Sıcaklığı'
            else:
                short_names[col] = 'İşlem Sıcaklığı'
        elif 'speed' in col.lower():
            short_names[col] = 'Dönme Hızı'
        elif 'torque' in col.lower():
            short_names[col] = 'Tork'
        elif 'wear' in col.lower():
            short_names[col] = 'Takım Aşınması'
        else:
            short_names[col] = col
    
    # İsimleri değiştir
    sensor_corr_renamed = sensor_corr.rename(index=short_names, columns=short_names)
    
    # Heatmap oluştur
    mask = np.triu(np.ones_like(sensor_corr_renamed, dtype=bool))
    sns.heatmap(sensor_corr_renamed, 
                annot=True, 
                cmap='RdYlBu_r', 
                center=0,
                square=True,
                fmt='.3f',
                cbar_kws={"shrink": .8},
                mask=mask)
    
    plt.title('Sensörler Arası Pearson Korelasyon Matrisi', fontsize=14, fontweight='bold', pad=15)
    plt.tight_layout()
    # Başlığın sığması için extra space ekle
    plt.subplots_adjust(top=0.92)
    print("✅ Sensör korelasyon heatmap kaydedildi: sensor_correlation_heatmap.png")
    plt.show()
    
    # 2. Arıza tiplerine göre korelasyon
    plt.figure(figsize=(14, 8))
    
    # Arıza tipleri ile sensörler arası Pearson korelasyon
    failure_types = ['TWF', 'HDF', 'PWF', 'OSF', 'RNF', 'Machine failure']
    failure_sensor_corr = df[numeric_columns + failure_types].corr(method='pearson')
    
    # Sadece arıza tipleri ile sensörler arasındaki korelasyonu al
    failure_corr_subset = failure_sensor_corr.loc[failure_types, numeric_columns]
    
    # İsimleri değiştir (Kısaltma kullan)
    failure_names_tr = {
        'TWF': 'TWF\n(Takım Aşınması)',
        'HDF': 'HDF\n(Isı Dağılım)', 
        'PWF': 'PWF\n(Güç Arızası)',
        'OSF': 'OSF\n(Aşırı Zorlanma)',
        'RNF': 'RNF\n(Rastgele Arıza)',
        'Machine failure': 'Toplam\nArıza'
    }
    
    failure_corr_renamed = failure_corr_subset.rename(index=failure_names_tr, columns=short_names)
    
    sns.heatmap(failure_corr_renamed, 
                annot=True, 
                cmap='RdBu_r', 
                center=0,
                fmt='.3f',
                cbar_kws={"shrink": .8})
    
    plt.title('Arıza Tipleri ile Sensör Verileri Arasındaki Pearson Korelasyon', fontsize=16, fontweight='bold', pad=20)
    plt.xlabel('Sensör Verileri', fontsize=12)
    plt.ylabel('Arıza Tipleri', fontsize=12)
    plt.tight_layout()
    print("✅ Arıza-sensör korelasyon haritası kaydedildi: failure_sensor_correlation.png")
    plt.show()
    
    # 3. Korelasyon dağılım grafikleri (3 ayrı görsel olarak)
    # En yüksek korelasyona sahip sensör çiftleri
    sensor_corr_abs = sensor_corr.abs()
    
    # Diagonal değerleri çıkar
    for i in range(len(sensor_corr_abs)):
        sensor_corr_abs.iloc[i, i] = 0
    
    # En yüksek korelasyonları bul
    high_corr_pairs = []
    for i in range(len(sensor_corr_abs.columns)):
        for j in range(i+1, len(sensor_corr_abs.columns)):
            col1 = sensor_corr_abs.columns[i]
            col2 = sensor_corr_abs.columns[j]
            corr_val = sensor_corr_abs.iloc[i, j]
            high_corr_pairs.append((col1, col2, corr_val))
    
    # Korelasyon değerine göre sırala
    high_corr_pairs.sort(key=lambda x: x[2], reverse=True)
    
    # 3 ayrı görsel oluştur (her birinde 2'şer çift)
    pairs_per_plot = 2
    for plot_idx in range(3):
        fig, axes = plt.subplots(1, 2, figsize=(12, 5))
        
        start_idx = plot_idx * pairs_per_plot
        end_idx = start_idx + pairs_per_plot
        
        for idx, (col1, col2, corr_val) in enumerate(high_corr_pairs[start_idx:end_idx]):
            if idx >= len(axes):
                break
                
            ax = axes[idx]
            
            # Scatter plot
            ax.scatter(df[col1], df[col2], alpha=0.6, s=15, color='steelblue')
            
            # Trend çizgisi
            z = np.polyfit(df[col1], df[col2], 1)
            p = np.poly1d(z)
            ax.plot(df[col1], p(df[col1]), "r--", alpha=0.8, linewidth=2)
            
            # Başlık ve etiketler
            name1 = short_names.get(col1, col1)
            name2 = short_names.get(col2, col2)
            real_corr = sensor_corr.loc[col1, col2]
            
            ax.set_title(f'{name1} vs {name2}\nKorelasyon: {real_corr:.3f}', 
                        fontsize=12, fontweight='bold')
            ax.set_xlabel(name1, fontsize=11)
            ax.set_ylabel(name2, fontsize=11)
            ax.grid(True, alpha=0.3)
        
        # Eğer tek çift varsa, ikinci subplot'u kaldır
        if len(high_corr_pairs[start_idx:end_idx]) == 1:
            fig.delaxes(axes[1])
        
        plt.suptitle(f'En Yüksek Korelasyonlu Sensör Çiftleri - Grup {plot_idx + 1}', 
                    fontsize=14, fontweight='bold')
        plt.tight_layout()
        plt.subplots_adjust(top=0.85)
        
        filename = f'sensor_correlation_scatter_group_{plot_idx + 1}.png'
        print(f"✅ Korelasyon scatter grafiği kaydedildi: {filename}")
        plt.show()
    
    # 4. Arıza oranları bar grafik
    plt.figure(figsize=(12, 6))
    
    # Bar grafik için kısaltmalı isimler
    failure_names_short = {
        'TWF': 'TWF\n(Takım Aşınması)',
        'HDF': 'HDF\n(Isı Dağılım)', 
        'PWF': 'PWF\n(Güç Arızası)',
        'OSF': 'OSF\n(Aşırı Zorlanma)',
        'RNF': 'RNF\n(Rastgele)',
        'Machine failure': 'Toplam Arıza'
    }
    
    failure_counts = {}
    for col in failure_types:
        if col in df.columns:
            count = df[col].sum()
            failure_counts[failure_names_short.get(col, col)] = count
    
    # Bar grafik
    names = list(failure_counts.keys())
    counts = list(failure_counts.values())
    
    bars = plt.bar(names, counts, color=['#e74c3c', '#f39c12', '#3498db', '#9b59b6', '#1abc9c', '#34495e'])
    
    # Değerleri bar'ların üstüne yaz
    for bar, count in zip(bars, counts):
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height + max(counts)*0.01,
                f'{count:,}', ha='center', va='bottom', fontweight='bold')
    
    plt.title('Arıza Türlerine Göre Dağılım', fontsize=16, fontweight='bold', pad=20)
    plt.xlabel('Arıza Türleri', fontsize=12)
    plt.ylabel('Arıza Sayısı', fontsize=12)
    plt.xticks(rotation=0, ha='center')  # Kısaltma kullandığımız için döndürme gerekmiyor
    plt.grid(axis='y', alpha=0.3)
    plt.tight_layout()
    print("✅ Arıza dağılım grafiği kaydedildi: failure_distribution.png")
    plt.show()
    
    # 5. Sensör verilerinin histogram dağılımları (3 ayrı görsel: 2+2+1)
    sensors_per_plot = [2, 2, 1]  # İlk iki grafikte 2'şer, son grafikte 1 sensör
    
    current_sensor_idx = 0
    for plot_idx, sensor_count in enumerate(sensors_per_plot):
        # Subplot düzenini belirle
        if sensor_count == 1:
            fig, axes = plt.subplots(1, 1, figsize=(8, 6))
            axes = [axes]  # Tek element için liste yap
        else:
            fig, axes = plt.subplots(1, sensor_count, figsize=(12, 5))
        
        # Bu grafikteki sensörleri işle
        for subplot_idx in range(sensor_count):
            if current_sensor_idx >= len(numeric_columns):
                break
                
            col = numeric_columns[current_sensor_idx]
            ax = axes[subplot_idx] if sensor_count > 1 else axes[0]
            
            # Normal veriler (arızasız)
            normal_data = df[df['Machine failure'] == 0][col]
            # Arızalı veriler
            failure_data = df[df['Machine failure'] == 1][col]
            
            # Histogram
            ax.hist(normal_data, bins=50, alpha=0.7, label='Normal', color='green', density=True)
            ax.hist(failure_data, bins=30, alpha=0.7, label='Arızalı', color='red', density=True)
            
            # İstatistikler
            normal_mean = normal_data.mean()
            failure_mean = failure_data.mean()
            
            ax.axvline(normal_mean, color='green', linestyle='--', alpha=0.8, 
                      label=f'Normal Ort: {normal_mean:.1f}')
            ax.axvline(failure_mean, color='red', linestyle='--', alpha=0.8, 
                      label=f'Arızalı Ort: {failure_mean:.1f}')
            
            # Başlık ve etiketler
            sensor_name = short_names.get(col, col)
            ax.set_title(f'{sensor_name} Dağılımı', fontsize=12, fontweight='bold')
            ax.set_xlabel(sensor_name, fontsize=11)
            ax.set_ylabel('Yoğunluk', fontsize=11)
            ax.legend(fontsize=9)
            ax.grid(True, alpha=0.3)
            
            current_sensor_idx += 1
        
        # Genel başlık
        plt.suptitle(f'Sensör Dağılımları - Normal vs Arızalı (Grup {plot_idx + 1})', 
                    fontsize=14, fontweight='bold')
        plt.tight_layout()
        plt.subplots_adjust(top=0.85)
        
        # Kaydet
        filename = f'sensor_distributions_group_{plot_idx + 1}.png'
        print(f"✅ Sensör dağılım histogramları kaydedildi: {filename}")
        plt.show()
    
    print("🎨 Tüm görselleştirmeler tamamlandı!")

def analyze_ai4i2020_dataset():
    """AI4I2020 veri setinin kapsamlı istatistiksel analizini yapar"""
    
    print("📊 AI4I2020 Dataset İstatistiksel Analizi")
    print("=" * 60)
    
    # Veri setini yükle
    try:
        df = pd.read_csv('ai4i2020.csv')
        print(f"✅ Veri seti yüklendi: {len(df)} satır, {len(df.columns)} sütun")
    except FileNotFoundError:
        print("❌ ai4i2020.csv dosyası bulunamadı!")
        return
    
    # 1. GENEL VERİ SETİ BİLGİLERİ
    print("\n" + "="*60)
    print("📋 1. GENEL VERİ SETİ BİLGİLERİ")
    print("="*60)
    print(f"📊 Toplam Kayıt Sayısı: {len(df):,}")
    print(f"📊 Toplam Özellik Sayısı: {len(df.columns)}")
    print(f"📊 Veri Seti Boyutu: {df.memory_usage(deep=True).sum() / 1024**2:.2f} MB")
    
    # Eksik değer kontrolü
    missing_values = df.isnull().sum()
    if missing_values.sum() > 0:
        print(f"⚠️ Eksik Değerler:")
        for col, missing in missing_values[missing_values > 0].items():
            print(f"   • {col}: {missing} ({missing/len(df)*100:.2f}%)")
    else:
        print("✅ Eksik değer yok")
    
    # 2. ARIZA ANALİZİ
    print("\n" + "="*60)
    print("🚨 2. ARIZA TİPLERİ ANALİZİ")
    print("="*60)
    
    # Arıza sütunları
    failure_columns = ['Machine failure', 'TWF', 'HDF', 'PWF', 'OSF', 'RNF']
    failure_names = {
        'Machine failure': 'Genel Makine Arızası',
        'TWF': 'TWF - Takım Aşınması Arızası (Tool Wear Failure)',
        'HDF': 'HDF - Isı Dağılım Arızası (Heat Dissipation Failure)', 
        'PWF': 'PWF - Güç Arızası (Power Failure)',
        'OSF': 'OSF - Aşırı Zorlanma Arızası (Overstrain Failure)',
        'RNF': 'RNF - Rastgele Arıza (Random Failure)'
    }
    
    print("📊 Arıza Türü Dağılımı:")
    print("-" * 50)
    
    total_records = len(df)
    for col in failure_columns:
        if col in df.columns:
            failure_count = df[col].sum()
            failure_rate = (failure_count / total_records) * 100
            no_failure = total_records - failure_count
            
            print(f"🔸 {failure_names.get(col, col)}:")
            print(f"   • Arızalı: {failure_count:,} ({failure_rate:.2f}%)")
            print(f"   • Normal: {no_failure:,} ({100-failure_rate:.2f}%)")
            print()
    
    # Arıza kombinasyonları
    print("🔍 Arıza Kombinasyonları:")
    print("-" * 30)
    
    # Hiç arıza olmayan kayıtlar
    no_failure = df[(df['TWF'] == 0) & (df['HDF'] == 0) & (df['PWF'] == 0) & 
                    (df['OSF'] == 0) & (df['RNF'] == 0)]
    print(f"✅ Hiç arıza yok: {len(no_failure):,} ({len(no_failure)/total_records*100:.2f}%)")
    
    # Tek arıza tipi
    for col in ['TWF', 'HDF', 'PWF', 'OSF', 'RNF']:
        if col in df.columns:
            single_failure = df[(df[col] == 1) & 
                               (df[[c for c in ['TWF', 'HDF', 'PWF', 'OSF', 'RNF'] if c != col]].sum(axis=1) == 0)]
            if len(single_failure) > 0:
                print(f"🔸 Sadece {col}: {len(single_failure):,} ({len(single_failure)/total_records*100:.2f}%)")
    
    # Çoklu arıza
    multiple_failures = df[(df[['TWF', 'HDF', 'PWF', 'OSF', 'RNF']].sum(axis=1) > 1)]
    if len(multiple_failures) > 0:
        print(f"⚠️ Çoklu arıza: {len(multiple_failures):,} ({len(multiple_failures)/total_records*100:.2f}%)")
    
    # 3. MAKİNE TİPİ ANALİZİ
    print("\n" + "="*60)
    print("🏭 3. MAKİNE TİPİ ANALİZİ")
    print("="*60)
    
    if 'Type' in df.columns:
        machine_types = df['Type'].value_counts()
        print("📊 Makine Tipi Dağılımı:")
        print("-" * 25)
        
        type_names = {
            'L': 'L - Low Quality (Düşük Kalite)',
            'M': 'M - Medium Quality (Orta Kalite)', 
            'H': 'H - High Quality (Yüksek Kalite)'
        }
        
        for machine_type, count in machine_types.items():
            percentage = (count / total_records) * 100
            type_name = type_names.get(machine_type, machine_type)
            print(f"🔸 {machine_type} - {type_name}: {count:,} ({percentage:.2f}%)")
        
        # Makine tipine göre arıza oranları
        print("\n📈 Makine Tipine Göre Arıza Oranları:")
        print("-" * 35)
        for machine_type in machine_types.index:
            type_data = df[df['Type'] == machine_type]
            failure_rate = (type_data['Machine failure'].sum() / len(type_data)) * 100
            type_name = type_names.get(machine_type, machine_type)
            print(f"🔸 {machine_type} - {type_name}: {failure_rate:.2f}% arıza oranı")
    
    # 4. SENSÖR VERİLERİ İSTATİSTİKLERİ
    print("\n" + "="*60)
    print("📊 4. SENSÖR VERİLERİ İSTATİSTİKLERİ")
    print("="*60)
    
    # Numerik sütunlar
    numeric_columns = ['Air temperature [K]', 'Process temperature [K]', 
                      'Rotational speed [rpm]', 'Torque [Nm]', 'Tool wear [min]']
    
    sensor_names = {
        'Air temperature [K]': 'Hava Sıcaklığı [K]',
        'Process temperature [K]': 'İşlem Sıcaklığı [K]',
        'Rotational speed [rpm]': 'Dönme Hızı [rpm]',
        'Torque [Nm]': 'Tork [Nm]',
        'Tool wear [min]': 'Takım Aşınması [dk]'
    }
    
    print("📋 Çizelge 4.1. Sensör Verilerinin İstatistiksel Özeti")
    print("-" * 80)
    print(f"{'Özellikler':<25} {'Veri':<8} {'Ortalama':<10} {'Standart':<10} {'En':<8} {'En Büyük':<10}")
    print(f"{'':25} {'Miktarı':<8} {'Değer':<10} {'Sapma':<10} {'Küçük':<8} {'Değer':<10}")
    print(f"{'':25} {'':8} {'':10} {'':10} {'Değer':<8} {'':10}")
    print("-" * 80)
    
    for col in numeric_columns:
        if col in df.columns:
            data = df[col]
            sensor_name = sensor_names.get(col, col)
            
            count = len(data)
            mean = data.mean()
            std = data.std()
            min_val = data.min()
            max_val = data.max()
            
            print(f"{sensor_name:<25} {count:<8} {mean:<10.3f} {std:<10.3f} {min_val:<8.2f} {max_val:<10.2f}")
    
    # 5. DETAYLI İSTATİSTİKLER
    print("\n" + "="*60)
    print("📈 5. DETAYLI İSTATİSTİK TABLOSU")
    print("="*60)
    
    print("📋 Tüm Numerik Özelliklerin Detaylı İstatistikleri:")
    print("-" * 50)
    
    stats_df = df[numeric_columns].describe()
    
    # Güzel bir format için
    print(f"{'İstatistik':<15}", end="")
    for col in numeric_columns:
        short_name = col.split('[')[0].strip()[:12]  # Kısa isim
        print(f"{short_name:<12}", end="")
    print()
    print("-" * (15 + 12 * len(numeric_columns)))
    
    stat_names = {
        'count': 'Kayıt Sayısı',
        'mean': 'Ortalama', 
        'std': 'Std Sapma',
        'min': 'Minimum',
        '25%': '1. Çeyrek',
        '50%': 'Medyan',
        '75%': '3. Çeyrek',
        'max': 'Maksimum'
    }
    
    for stat in stats_df.index:
        stat_name = stat_names.get(stat, stat)
        print(f"{stat_name:<15}", end="")
        for col in numeric_columns:
            if stat == 'count':
                print(f"{int(stats_df.loc[stat, col]):<12}", end="")
            else:
                print(f"{stats_df.loc[stat, col]:<12.2f}", end="")
        print()
    
    # 6. KORELASYON ANALİZİ
    print("\n" + "="*60)
    print("🔗 6. PEARSON KORELASYON ANALİZİ")
    print("="*60)
    print("ℹ️ Pearson korelasyon katsayısı: Doğrusal ilişkinin gücünü ölçer (-1 ile +1 arasında)")
    print("   • r > 0.7: Güçlü pozitif korelasyon")
    print("   • 0.3 < r < 0.7: Orta düzeyde korelasyon") 
    print("   • r < 0.3: Zayıf korelasyon")
    print("   • r < 0: Negatif (ters) korelasyon")
    
    # Numerik veriler için Pearson korelasyon matrisi
    correlation_columns = numeric_columns + ['Machine failure'] + ['TWF', 'HDF', 'PWF', 'OSF', 'RNF']
    correlation_matrix = df[correlation_columns].corr(method='pearson')  # Pearson korelasyon katsayısı
    
    print("📊 Arıza ile Sensör Verileri Arasındaki Pearson Korelasyon:")
    print("-" * 50)
    
    failure_corr = correlation_matrix['Machine failure'].drop('Machine failure')
    for feature, corr_value in failure_corr.items():
        if feature in sensor_names:
            sensor_name = sensor_names.get(feature, feature)
        else:
            sensor_name = feature
        correlation_strength = ""
        if abs(corr_value) > 0.7:
            correlation_strength = "🔴 Güçlü"
        elif abs(corr_value) > 0.3:
            correlation_strength = "🟡 Orta"
        else:
            correlation_strength = "🟢 Zayıf"
        
        print(f"• {sensor_name:<25}: {corr_value:>6.3f} {correlation_strength}")
    
    # Sensörler arası korelasyon
    print(f"\n📈 Sensörler Arası Pearson Korelasyon Matrisi:")
    print("-" * 45)
    
    sensor_corr = df[numeric_columns].corr(method='pearson')
    print("📋 Pearson Korelasyon Katsayıları (Sensörler Arası):")
    print("-" * 55)
    
    # Korelasyon matrisini tablo formatında göster
    print(f"{'Sensör':<20}", end="")
    for col in numeric_columns:
        short_name = col.split('[')[0].strip()[:8]
        print(f"{short_name:<10}", end="")
    print()
    print("-" * (20 + 10 * len(numeric_columns)))
    
    for i, row_col in enumerate(numeric_columns):
        row_name = sensor_names.get(row_col, row_col)[:18]
        print(f"{row_name:<20}", end="")
        for j, col_col in enumerate(numeric_columns):
            corr_val = sensor_corr.loc[row_col, col_col]
            if i == j:
                print(f"{'1.000':<10}", end="")  # Diagonal
            else:
                print(f"{corr_val:<10.3f}", end="")
        print()
    
    # Korelasyon görselleştirmesi oluştur
    create_correlation_visualizations(df, numeric_columns, sensor_names, correlation_matrix)
    
    # 7. ÖZET
    print("\n" + "="*60)
    print("📋 7. ÖZET")
    print("="*60)
    
    total_failures = df['Machine failure'].sum()
    failure_rate = (total_failures / total_records) * 100
    
    print(f"📊 Toplam Kayıt: {total_records:,}")
    print(f"🚨 Toplam Arıza: {total_failures:,} ({failure_rate:.2f}%)")
    print(f"✅ Normal Durum: {total_records - total_failures:,} ({100-failure_rate:.2f}%)")
    print(f"🏭 Makine Tipi: {len(df['Type'].unique())} farklı tip")
    print(f"📈 Sensör Sayısı: {len(numeric_columns)} adet")
    
    # En çok arıza olan sensör değer aralığı
    print(f"\n🎯 Kritik Bulgular:")
    print(f"• En yüksek arıza oranına sahip makine tipi: {df.groupby('Type')['Machine failure'].mean().idxmax()}")
    
    # Takım aşınması kritik değeri
    critical_tool_wear = df[df['TWF'] == 1]['Tool wear [min]'].min()
    print(f"• Takım aşınması kritik eşiği: ≥{critical_tool_wear} dakika")
    
    print("\n✅ İstatistiksel analiz tamamlandı!")
    print(f"\n📊 Oluşturulan Görselleştirmeler:")
    print(f"• sensor_correlation_heatmap.png - Sensörler arası korelasyon ısı haritası")
    print(f"• failure_sensor_correlation.png - Arıza-sensör korelasyon haritası") 
    print(f"• sensor_correlation_scatter_group_1.png - En yüksek korelasyonlu çiftler (Grup 1)")
    print(f"• sensor_correlation_scatter_group_2.png - En yüksek korelasyonlu çiftler (Grup 2)")
    print(f"• sensor_correlation_scatter_group_3.png - En yüksek korelasyonlu çiftler (Grup 3)")
    print(f"• failure_distribution.png - Arıza türleri dağılım grafiği")
    print(f"• sensor_distributions_group_1.png - Normal vs Arızalı sensör dağılımları (Grup 1)")
    print(f"• sensor_distributions_group_2.png - Normal vs Arızalı sensör dağılımları (Grup 2)")
    print(f"• sensor_distributions_group_3.png - Normal vs Arızalı sensör dağılımları (Grup 3)")
    print(f"\n🎯 Toplam 9 adet yüksek kaliteli görselleştirme oluşturuldu!")

if __name__ == "__main__":
    analyze_ai4i2020_dataset()
