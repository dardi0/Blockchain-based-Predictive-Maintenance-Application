# -*- coding: utf-8 -*-
"""
📈 Reporting & Visualization - Raporlama ve Görselleştirme Modülü
================================================================
Bu modül train_model fonksiyonundan ayrıştırılan raporlama ve görselleştirme
fonksiyonlarını içerir. Tek sorumluluk: Sonuçları göstermek.
"""

import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import math
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, roc_curve, confusion_matrix, precision_recall_curve, average_precision_score, matthews_corrcoef

# Config'ten import'lar
from config import VisualizationConfig, TrainingConfig

def print_cv_results(cv_scores):
    """Cross Validation sonuçlarını detaylı tablolarla konsola yazdırır.

    5-fold CV sonuçlarını hem varsayılan eşik (0.5) hem de optimal eşik için
    formatlanmış tablolar halinde gösterir. Her metrik için ortalama, standart
    sapma, minimum ve maksimum değerleri içerir.

    Args:
        cv_scores (dict): CV sonuçlarını içeren sözlük. Şu anahtarları içermeli:
            - accuracy, precision, recall, f1, auc (list): Her fold için metrikler
            - accuracy_opt, precision_opt, recall_opt, f1_opt (list): Optimal eşik metrikleri
            - optimal_threshold (list): Her fold için optimal eşik değerleri

    Example:
        >>> cv_scores = {'accuracy': [0.8, 0.82, 0.81], 'f1': [0.75, 0.77, 0.76]}
        >>> print_cv_results(cv_scores)
        ================================================================================
        🎯 5-FOLD CROSS VALIDATION SONUÇLARI
        ================================================================================
        📊 CROSS VALIDATION PERFORMANS METRİKLERİ (0.5 EŞİĞİ):
        ...
    """
    print(f"\n{'='*80}")
    print(f"🎯 {TrainingConfig.CV_SPLITS}-FOLD CROSS VALIDATION SONUÇLARI")
    print(f"{'='*80}")
    
    # CV performans metrikleri tablosu (config'ten varsayılan eşik)
    print(f"\n📊 CROSS VALIDATION PERFORMANS METRİKLERİ ({TrainingConfig.DEFAULT_THRESHOLD} EŞİĞİ):")
    print(f"┌{'─'*20}┬{'─'*10}┬{'─'*10}┬{'─'*10}┬{'─'*10}┐")
    print(f"│ {'Metrik':<18} │ {'Ortalama':<8} │ {'Std':<8} │ {'Min':<8} │ {'Max':<8} │")
    print(f"├{'─'*20}┼{'─'*10}┼{'─'*10}┼{'─'*10}┼{'─'*10}┤")
    
    standard_metrics = ['accuracy', 'precision', 'recall', 'f1', 'auc', 'mcc']
    for metric_name in standard_metrics:
        scores = cv_scores[metric_name]
        mean_score = np.mean(scores)
        std_score = np.std(scores)
        min_score = np.min(scores)
        max_score = np.max(scores)
        display_name = metric_name.capitalize().replace('Auc', 'AUC').replace('Mcc', 'MCC')
        
        print(f"│ {display_name:<18} │ {mean_score:<8.4f} │ {std_score:<8.4f} │ {min_score:<8.4f} │ {max_score:<8.4f} │")
    
    print(f"└{'─'*20}┴{'─'*10}┴{'─'*10}┴{'─'*10}┴{'─'*10}┘")
    
    # CV performans metrikleri tablosu (Optimal eşiği)
    print(f"\n🎯 CROSS VALIDATION PERFORMANS METRİKLERİ (OPTİMAL EŞİK):")
    print(f"┌{'─'*20}┬{'─'*10}┬{'─'*10}┬{'─'*10}┬{'─'*10}┐")
    print(f"│ {'Metrik':<18} │ {'Ortalama':<8} │ {'Std':<8} │ {'Min':<8} │ {'Max':<8} │")
    print(f"├{'─'*20}┼{'─'*10}┼{'─'*10}┼{'─'*10}┼{'─'*10}┤")
    
    optimal_metrics = ['accuracy_opt', 'precision_opt', 'recall_opt', 'f1_opt', 'mcc_opt', 'optimal_threshold']
    for metric_name in optimal_metrics:
        scores = cv_scores[metric_name]
        mean_score = np.mean(scores)
        std_score = np.std(scores)
        min_score = np.min(scores)
        max_score = np.max(scores)
        
        if metric_name == 'optimal_threshold':
            display_name = 'Optimal Threshold'
        else:
            display_name = metric_name.replace('_opt', '').capitalize().replace('Mcc', 'MCC')
        
        print(f"│ {display_name:<18} │ {mean_score:<8.4f} │ {std_score:<8.4f} │ {min_score:<8.4f} │ {max_score:<8.4f} │")
    
    print(f"└{'─'*20}┴{'─'*10}┴{'─'*10}┴{'─'*10}┴{'─'*10}┘")
    
    # İyileşme analizi - Tüm metrikler için
    accuracy_improvement = ((np.mean(cv_scores['accuracy_opt']) - np.mean(cv_scores['accuracy'])) / np.mean(cv_scores['accuracy'])) * 100
    precision_improvement = ((np.mean(cv_scores['precision_opt']) - np.mean(cv_scores['precision'])) / np.mean(cv_scores['precision'])) * 100
    recall_improvement = ((np.mean(cv_scores['recall_opt']) - np.mean(cv_scores['recall'])) / np.mean(cv_scores['recall'])) * 100
    f1_improvement = ((np.mean(cv_scores['f1_opt']) - np.mean(cv_scores['f1'])) / np.mean(cv_scores['f1'])) * 100
    mcc_improvement = ((np.mean(cv_scores['mcc_opt']) - np.mean(cv_scores['mcc'])) / abs(np.mean(cv_scores['mcc'])) * 100 if np.mean(cv_scores['mcc']) != 0 else 0)
    
    print(f"\n⚡ OPTİMAL EŞİK İYİLEŞME ANALİZİ:")
    print(f"   • Accuracy İyileşme: %{accuracy_improvement:+.2f}")
    print(f"   • Precision İyileşme: %{precision_improvement:+.2f}")
    print(f"   • Recall İyileşme: %{recall_improvement:+.2f}")
    print(f"   • F1-Score İyileşme: %{f1_improvement:+.2f}")
    print(f"   • MCC İyileşme: %{mcc_improvement:+.2f}")
    print(f"   • Ortalama Optimal Eşik: {np.mean(cv_scores['optimal_threshold']):.3f}")
    print(f"   • Eşik Standart Sapma: {np.std(cv_scores['optimal_threshold']):.3f}")
    
    # Her fold için detay (config'ten varsayılan eşik)
    print(f"\n📋 FOLD DETAYLARI ({TrainingConfig.DEFAULT_THRESHOLD} EŞİĞİ):")
    print(f"┌{'─'*6}┬{'─'*10}┬{'─'*10}┬{'─'*10}┬{'─'*10}┬{'─'*10}┬{'─'*10}┐")
    print(f"│ {'Fold':<4} │ {'Accuracy':<8} │ {'Precision':<8} │ {'Recall':<8} │ {'F1':<8} │ {'AUC':<8} │ {'MCC':<8} │")
    print(f"├{'─'*6}┼{'─'*10}┼{'─'*10}┼{'─'*10}┼{'─'*10}┼{'─'*10}┼{'─'*10}┤")
    
    for i in range(TrainingConfig.CV_SPLITS):
        print(f"│ {i+1:<4} │ {cv_scores['accuracy'][i]:<8.4f} │ {cv_scores['precision'][i]:<8.4f} │ {cv_scores['recall'][i]:<8.4f} │ {cv_scores['f1'][i]:<8.4f} │ {cv_scores['auc'][i]:<8.4f} │ {cv_scores['mcc'][i]:<8.4f} │")
    
    print(f"└{'─'*6}┴{'─'*10}┴{'─'*10}┴{'─'*10}┴{'─'*10}┴{'─'*10}┴{'─'*10}┘")
    
    # Her fold için detay (Optimal eşiği)
    print(f"\n🎯 FOLD DETAYLARI (OPTİMAL EŞİK):")
    print(f"┌{'─'*6}┬{'─'*10}┬{'─'*10}┬{'─'*10}┬{'─'*10}┬{'─'*10}┬{'─'*10}┐")
    print(f"│ {'Fold':<4} │ {'Accuracy':<8} │ {'Precision':<8} │ {'Recall':<8} │ {'F1':<8} │ {'MCC':<8} │ {'Eşik':<8} │")
    print(f"├{'─'*6}┼{'─'*10}┼{'─'*10}┼{'─'*10}┼{'─'*10}┼{'─'*10}┼{'─'*10}┤")
    
    for i in range(TrainingConfig.CV_SPLITS):
        print(f"│ {i+1:<4} │ {cv_scores['accuracy_opt'][i]:<8.4f} │ {cv_scores['precision_opt'][i]:<8.4f} │ {cv_scores['recall_opt'][i]:<8.4f} │ {cv_scores['f1_opt'][i]:<8.4f} │ {cv_scores['mcc_opt'][i]:<8.4f} │ {cv_scores['optimal_threshold'][i]:<8.3f} │")
    
    print(f"└{'─'*6}┴{'─'*10}┴{'─'*10}┴{'─'*10}┴{'─'*10}┴{'─'*10}┴{'─'*10}┘")

def print_test_results(test_results, cv_scores):
    """Test seti performans sonuçlarını detaylı tablolarla konsola yazdırır.

    Final modelin test seti üzerindeki performansını hem varsayılan eşik (0.5)
    hem de optimal eşik ile değerlendirir. CV sonuçları ile karşılaştırma yapar.

    Args:
        test_results (dict): Test sonuçlarını içeren sözlük. Şu anahtarları içermeli:
            - y_test (array): Gerçek test etiketleri
            - y_pred (array): Test tahminleri (0.5 eşik)
            - y_pred_prob (array): Test olasılıkları
            - y_pred_opt (array): Test tahminleri (optimal eşik)
            - optimal_threshold (float): Bulunan optimal eşik değeri
        cv_scores (dict): CV sonuçları (karşılaştırma için).

    Example:
        >>> print_test_results(test_results, cv_scores)
        ================================================================================
        🎯 FINAL MODEL TEST SETİ SONUÇLARI
        ================================================================================
        📊 TEST SETİ PERFORMANS METRİKLERİ (0.5 EŞİĞİ):
        ...
    """
    y_test = test_results['y_true']
    y_pred_prob = test_results['y_pred_proba']
    y_pred_opt = test_results['y_pred']  # Bu optimal threshold ile tahmin edilmiş
    optimal_threshold = test_results['optimal_threshold']
    
    # Normal threshold (config'ten) ile tahmin hesapla
    y_pred = (y_pred_prob > TrainingConfig.DEFAULT_THRESHOLD).astype(int)
    
    # Detaylı performans metrikleri (0.5 eşiği)
    test_accuracy = accuracy_score(y_test, y_pred)
    test_precision = precision_score(y_test, y_pred, zero_division=0)
    test_recall = recall_score(y_test, y_pred, zero_division=0)
    test_f1 = f1_score(y_test, y_pred, zero_division=0)
    test_auc = roc_auc_score(y_test, y_pred_prob)
    test_auc_pr = average_precision_score(y_test, y_pred_prob)  # AUC-PR (Average Precision)
    test_mcc = matthews_corrcoef(y_test, y_pred)  # Matthews Correlation Coefficient
    
    # Detaylı performans metrikleri (Optimal eşiği)
    test_accuracy_opt = accuracy_score(y_test, y_pred_opt)
    test_precision_opt = precision_score(y_test, y_pred_opt, zero_division=0)
    test_recall_opt = recall_score(y_test, y_pred_opt, zero_division=0)
    test_f1_opt = f1_score(y_test, y_pred_opt, zero_division=0)
    test_mcc_opt = matthews_corrcoef(y_test, y_pred_opt)  # MCC optimal eşik
    
    # Confusion Matrix
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()
    
    print(f"\n🎯 NİHAİ LSTM-CNN MODEL TEST PERFORMANSI ({TrainingConfig.DEFAULT_THRESHOLD} EŞİĞİ):")
    print(f"┌{'─'*25}┬{'─'*10}┬{'─'*10}┬{'─'*15}┐")
    print(f"│ {'Metrik':<23} │ {'Test':<8} │ {'CV Ort.':<8} │ {'Fark':<13} │")
    print(f"├{'─'*25}┼{'─'*10}┼{'─'*10}┼{'─'*15}┤")
    print(f"│ {'Doğruluk (Accuracy)':<23} │ {test_accuracy:<8.4f} │ {np.mean(cv_scores['accuracy']):<8.4f} │ {test_accuracy - np.mean(cv_scores['accuracy']):+8.4f} │")
    print(f"│ {'Kesinlik (Precision)':<23} │ {test_precision:<8.4f} │ {np.mean(cv_scores['precision']):<8.4f} │ {test_precision - np.mean(cv_scores['precision']):+8.4f} │")
    print(f"│ {'Duyarlılık (Recall)':<23} │ {test_recall:<8.4f} │ {np.mean(cv_scores['recall']):<8.4f} │ {test_recall - np.mean(cv_scores['recall']):+8.4f} │")
    print(f"│ {'F1-Score':<23} │ {test_f1:<8.4f} │ {np.mean(cv_scores['f1']):<8.4f} │ {test_f1 - np.mean(cv_scores['f1']):+8.4f} │")
    print(f"│ {'AUC-ROC':<23} │ {test_auc:<8.4f} │ {np.mean(cv_scores['auc']):<8.4f} │ {test_auc - np.mean(cv_scores['auc']):+8.4f} │")
    print(f"│ {'AUC-PR (Avg Precision)':<23} │ {test_auc_pr:<8.4f} │ {'N/A':<8} │ {'─':<13} │")
    print(f"│ {'MCC (Matthews Corr.)':<23} │ {test_mcc:<8.4f} │ {'N/A':<8} │ {'─':<13} │")
    print(f"└{'─'*25}┴{'─'*10}┴{'─'*10}┴{'─'*15}┘")
    
    print(f"\n🚀 NİHAİ LSTM-CNN MODEL TEST PERFORMANSI (OPTİMAL EŞİK: {optimal_threshold:.3f}):")
    print(f"┌{'─'*25}┬{'─'*10}┬{'─'*10}┬{'─'*15}┐")
    print(f"│ {'Metrik':<23} │ {'Test':<8} │ {'CV Ort.':<8} │ {'Fark':<13} │")
    print(f"├{'─'*25}┼{'─'*10}┼{'─'*10}┼{'─'*15}┤")
    print(f"│ {'Doğruluk (Accuracy)':<23} │ {test_accuracy_opt:<8.4f} │ {np.mean(cv_scores['accuracy_opt']):<8.4f} │ {test_accuracy_opt - np.mean(cv_scores['accuracy_opt']):+8.4f} │")
    print(f"│ {'Kesinlik (Precision)':<23} │ {test_precision_opt:<8.4f} │ {np.mean(cv_scores['precision_opt']):<8.4f} │ {test_precision_opt - np.mean(cv_scores['precision_opt']):+8.4f} │")
    print(f"│ {'Duyarlılık (Recall)':<23} │ {test_recall_opt:<8.4f} │ {np.mean(cv_scores['recall_opt']):<8.4f} │ {test_recall_opt - np.mean(cv_scores['recall_opt']):+8.4f} │")
    print(f"│ {'F1-Score':<23} │ {test_f1_opt:<8.4f} │ {np.mean(cv_scores['f1_opt']):<8.4f} │ {test_f1_opt - np.mean(cv_scores['f1_opt']):+8.4f} │")
    print(f"│ {'AUC-ROC':<23} │ {test_auc:<8.4f} │ {np.mean(cv_scores['auc']):<8.4f} │ {test_auc - np.mean(cv_scores['auc']):+8.4f} │")
    print(f"│ {'AUC-PR (Avg Precision)':<23} │ {test_auc_pr:<8.4f} │ {'N/A':<8} │ {'─':<13} │")
    print(f"│ {'MCC (Matthews Corr.)':<23} │ {test_mcc_opt:<8.4f} │ {'N/A':<8} │ {'─':<13} │")
    print(f"└{'─'*25}┴{'─'*10}┴{'─'*10}┴{'─'*15}┘")
    
    # Optimal eşik iyileşme analizi - Tüm metrikler için
    test_accuracy_improvement = ((test_accuracy_opt - test_accuracy) / test_accuracy) * 100
    test_precision_improvement = ((test_precision_opt - test_precision) / test_precision) * 100
    test_recall_improvement = ((test_recall_opt - test_recall) / test_recall) * 100
    test_f1_improvement = ((test_f1_opt - test_f1) / test_f1) * 100
    test_mcc_improvement = ((test_mcc_opt - test_mcc) / abs(test_mcc) * 100 if test_mcc != 0 else 0)
    
    print(f"\n⚡ TEST SETİ OPTİMAL EŞİK İYİLEŞME ANALİZİ:")
    print(f"   • Accuracy İyileşme: %{test_accuracy_improvement:+.2f}")
    print(f"   • Precision İyileşme: %{test_precision_improvement:+.2f}")
    print(f"   • Recall İyileşme: %{test_recall_improvement:+.2f}")
    print(f"   • F1-Score İyileşme: %{test_f1_improvement:+.2f}")
    print(f"   • MCC İyileşme: %{test_mcc_improvement:+.2f}")
    
    # Confusion Matrix tablosu
    print(f"\n🔍 TEST SETİ CONFUSION MATRIX:")
    print(f"┌{'─'*20}┬{'─'*12}┬{'─'*12}┐")
    header_text = "Tahmin \\ Gerçek"
    print(f"│ {header_text:<18} │ {'Normal':<10} │ {'Arızalı':<10} │")
    print(f"├{'─'*20}┼{'─'*12}┼{'─'*12}┤")
    print(f"│ {'Arıza Yok (0)':<18} │ {tn:<10,} │ {fp:<10,} │")
    print(f"│ {'Arıza Var (1)':<18} │ {fn:<10,} │ {tp:<10,} │")
    print(f"└{'─'*20}┴{'─'*12}┴{'─'*12}┘")

def plot_training_history(test_results):
    """Model eğitim geçmişini görselleştirir"""
    plt.style.use('default')
    
    # Training history'yi al
    history = test_results['history']
    
    # Training/Validation Loss Grafikleri
    _, (ax1, ax2) = plt.subplots(1, 2, figsize=VisualizationConfig.FIGURE_SIZE_LOSS)
    
    # Loss grafiği
    epochs_range = range(1, len(history['loss']) + 1)
    ax1.plot(epochs_range, history['loss'], 'b-', linewidth=VisualizationConfig.LINE_WIDTH, label='Training Loss')
    ax1.plot(epochs_range, history['val_loss'], 'r-', linewidth=VisualizationConfig.LINE_WIDTH, label='Validation Loss')
    ax1.set_title('Model Loss Grafikleri', fontweight='bold', fontsize=VisualizationConfig.TITLE_FONT_SIZE, pad=20)
    ax1.set_xlabel('Epoch', fontweight='bold', fontsize=VisualizationConfig.LABEL_FONT_SIZE)
    ax1.set_ylabel('Loss', fontweight='bold', fontsize=VisualizationConfig.LABEL_FONT_SIZE)
    ax1.legend(fontsize=VisualizationConfig.LEGEND_FONT_SIZE)
    ax1.grid(True, alpha=VisualizationConfig.GRID_ALPHA)
    
    # Accuracy grafiği
    ax2.plot(epochs_range, history['binary_accuracy'], 'b-', linewidth=VisualizationConfig.LINE_WIDTH, label='Training Accuracy')
    ax2.plot(epochs_range, history['val_binary_accuracy'], 'r-', linewidth=VisualizationConfig.LINE_WIDTH, label='Validation Accuracy')
    ax2.set_title('Model Accuracy Grafikleri', fontweight='bold', fontsize=VisualizationConfig.TITLE_FONT_SIZE, pad=20)
    ax2.set_xlabel('Epoch', fontweight='bold', fontsize=VisualizationConfig.LABEL_FONT_SIZE)
    ax2.set_ylabel('Accuracy', fontweight='bold', fontsize=VisualizationConfig.LABEL_FONT_SIZE)
    ax2.legend(fontsize=VisualizationConfig.LEGEND_FONT_SIZE)
    ax2.grid(True, alpha=VisualizationConfig.GRID_ALPHA)
    
    # Early stopping noktasını işaretle
    if len(history['loss']) < TrainingConfig.FINAL_MODEL_EPOCHS:
        stopped_epoch = len(history['loss'])
        ax1.axvline(x=stopped_epoch, color='green', linestyle='--', alpha=0.7, 
                   label=f'Early Stop (Epoch {stopped_epoch})')
        ax2.axvline(x=stopped_epoch, color='green', linestyle='--', alpha=0.7,
                   label=f'Early Stop (Epoch {stopped_epoch})')
        ax1.legend(fontsize=VisualizationConfig.LEGEND_FONT_SIZE)
        ax2.legend(fontsize=VisualizationConfig.LEGEND_FONT_SIZE)
    
    plt.tight_layout()
    plt.show()

def plot_fold_performance(cv_scores):
    """Fold bazında performans trendini görselleştirir"""
    _, ax = plt.subplots(figsize=VisualizationConfig.FIGURE_SIZE_FOLD_PERFORMANCE)
    folds = range(1, TrainingConfig.CV_SPLITS + 1)
    
    colors = VisualizationConfig.COLORS
    ax.plot(folds, cv_scores['accuracy'], 'o-', label='Accuracy', linewidth=VisualizationConfig.LINE_WIDTH, 
            markersize=VisualizationConfig.MARKER_SIZE, color=colors['accuracy'])
    ax.plot(folds, cv_scores['f1'], 's-', label='F1-Score', linewidth=VisualizationConfig.LINE_WIDTH, 
            markersize=VisualizationConfig.MARKER_SIZE, color=colors['f1'])
    ax.plot(folds, cv_scores['auc'], '^-', label='AUC', linewidth=VisualizationConfig.LINE_WIDTH, 
            markersize=VisualizationConfig.MARKER_SIZE, color=colors['auc'])
    ax.plot(folds, cv_scores['precision'], 'd-', label='Precision', linewidth=VisualizationConfig.LINE_WIDTH, 
            markersize=VisualizationConfig.MARKER_SIZE, color=colors['precision'])
    ax.plot(folds, cv_scores['recall'], 'v-', label='Recall', linewidth=VisualizationConfig.LINE_WIDTH, 
            markersize=VisualizationConfig.MARKER_SIZE, color=colors['recall'])
    
    ax.set_title('Fold Bazında Performans Trendi', fontweight='bold', fontsize=VisualizationConfig.TITLE_FONT_SIZE, pad=20)
    ax.set_xlabel('Fold Numarası', fontweight='bold', fontsize=VisualizationConfig.LABEL_FONT_SIZE)
    ax.set_ylabel('Skor', fontweight='bold', fontsize=VisualizationConfig.LABEL_FONT_SIZE)
    ax.legend(fontsize=VisualizationConfig.LEGEND_FONT_SIZE, loc='best')
    ax.grid(True, alpha=VisualizationConfig.GRID_ALPHA)
    ax.set_xticks(folds)
    ax.set_ylim(0, 1)
    
    plt.tight_layout()
    plt.show()

def plot_confusion_matrix(test_results):
    """Test seti confusion matrix'ini görselleştirir"""
    y_test = test_results['y_true']
    y_pred_prob = test_results['y_pred_proba']
    y_pred = (y_pred_prob > TrainingConfig.DEFAULT_THRESHOLD).astype(int)  # Config'ten varsayılan eşik
    
    _, ax = plt.subplots(figsize=VisualizationConfig.FIGURE_SIZE_CONFUSION_MATRIX)
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()
    
    cm_display = np.array([[tn, fp], [fn, tp]])
    
    # Hücre açıklamaları için özel annotasyon 
    cell_labels = np.array([
        [f'{tn}\n(True Negative)', 
         f'{fp}\n(False Positive)'],
        [f'{fn}\n(False Negative)', 
         f'{tp}\n(True Positive)']
    ])
    
    sns.heatmap(cm_display, annot=cell_labels, fmt='', cmap='Blues', 
                xticklabels=['Arıza Yok (0)', 'Arıza Var (1)'], 
                yticklabels=['Arıza Yok (0)', 'Arıza Var (1)'], ax=ax, 
                cbar_kws={'label': 'Sayı'}, annot_kws={'size': 12, 'weight': 'bold'})
    ax.set_title('Test Seti Confusion Matrix', fontweight='bold', fontsize=VisualizationConfig.TITLE_FONT_SIZE, pad=20)
    ax.set_xlabel('Gerçek Sınıf', fontweight='bold', fontsize=VisualizationConfig.LABEL_FONT_SIZE)
    ax.set_ylabel('Tahmin Edilen Sınıf', fontweight='bold', fontsize=VisualizationConfig.LABEL_FONT_SIZE)
    
    plt.tight_layout()
    plt.show()

def plot_cv_vs_test_comparison(test_results, cv_scores):
    """CV vs Test performans karşılaştırmasını görselleştirir"""
    y_test = test_results['y_true']
    y_pred_prob = test_results['y_pred_proba']
    y_pred = (y_pred_prob > TrainingConfig.DEFAULT_THRESHOLD).astype(int)  # Config'ten varsayılan eşik
    
    # Test skorları hesapla
    test_accuracy = accuracy_score(y_test, y_pred)
    test_precision = precision_score(y_test, y_pred, zero_division=0)
    test_recall = recall_score(y_test, y_pred, zero_division=0)
    test_f1 = f1_score(y_test, y_pred, zero_division=0)
    test_auc = roc_auc_score(y_test, y_pred_prob)
    
    _, ax = plt.subplots(figsize=VisualizationConfig.FIGURE_SIZE_CV_TEST_COMPARISON)
    metrics = ['Accuracy', 'Precision', 'Recall', 'F1', 'AUC']
    cv_means = [np.mean(cv_scores['accuracy']), np.mean(cv_scores['precision']), 
                np.mean(cv_scores['recall']), np.mean(cv_scores['f1']), np.mean(cv_scores['auc'])]
    test_scores = [test_accuracy, test_precision, test_recall, test_f1, test_auc]
    
    x = np.arange(len(metrics))
    width = 0.35
    
    colors = VisualizationConfig.COLORS
    ax.bar(x - width/2, cv_means, width, label='CV Ortalama', alpha=0.8, color=colors['cv_mean'])
    ax.bar(x + width/2, test_scores, width, label='Test Sonucu', alpha=0.8, color=colors['test_result'])
    
    # Değerleri bar'ların üstüne yaz
    for i, (cv_val, test_val) in enumerate(zip(cv_means, test_scores)):
        ax.text(i - width/2, cv_val + 0.01, f'{cv_val:.3f}', ha='center', va='bottom', fontweight='bold')
        ax.text(i + width/2, test_val + 0.01, f'{test_val:.3f}', ha='center', va='bottom', fontweight='bold')
    
    ax.set_title('Cross Validation vs Test Performansı', fontweight='bold', fontsize=VisualizationConfig.TITLE_FONT_SIZE, pad=20)
    ax.set_xlabel('Metrikler', fontweight='bold', fontsize=VisualizationConfig.LABEL_FONT_SIZE)
    ax.set_ylabel('Skor', fontweight='bold', fontsize=VisualizationConfig.LABEL_FONT_SIZE)
    ax.set_xticks(x)
    ax.set_xticklabels(metrics)
    ax.legend(fontsize=VisualizationConfig.LEGEND_FONT_SIZE)
    ax.grid(True, alpha=VisualizationConfig.GRID_ALPHA, axis='y')
    ax.set_ylim(0, 1)
    
    plt.tight_layout()
    plt.show()

def plot_roc_curve(test_results):
    """ROC eğrisini görselleştirir"""
    y_test = test_results['y_true']
    y_pred_prob = test_results['y_pred_proba']
    
    _, ax = plt.subplots(figsize=VisualizationConfig.FIGURE_SIZE_ROC_CURVE)
    
    fpr, tpr, thresholds = roc_curve(y_test, y_pred_prob)
    test_auc = roc_auc_score(y_test, y_pred_prob)
    
    colors = VisualizationConfig.COLORS
    ax.plot(fpr, tpr, color=colors['roc_curve'], linewidth=VisualizationConfig.LINE_WIDTH, 
            label=f'ROC Eğrisi (AUC = {test_auc:.3f})')
    ax.plot([0, 1], [0, 1], color=colors['random_line'], linestyle='--', linewidth=2, 
            label='Rastgele Sınıflandırma')
    
    ax.set_xlim([0.0, 1.0])
    ax.set_ylim([0.0, 1.05])
    ax.set_xlabel('False Positive Rate', fontsize=VisualizationConfig.LABEL_FONT_SIZE, fontweight='bold')
    ax.set_ylabel('True Positive Rate', fontsize=VisualizationConfig.LABEL_FONT_SIZE, fontweight='bold')
    ax.set_title('ROC Curve', fontsize=VisualizationConfig.TITLE_FONT_SIZE, fontweight='bold')
    ax.legend(loc="lower right", fontsize=VisualizationConfig.LEGEND_FONT_SIZE)
    ax.grid(True, alpha=VisualizationConfig.GRID_ALPHA)

    plt.tight_layout()
    plt.show()

def plot_precision_recall_curve(test_results):
    """Precision-Recall eğrisini görselleştirir.
    
    Dengesiz veri setleri için ROC eğrisinden daha bilgilendirici olan
    Precision-Recall eğrisini çizer. Özellikle azınlık sınıfının (arızalı
    makineler) ne kadar iyi tespit edildiğini gösterir.

    Args:
        test_results (dict): Test sonuçlarını içeren sözlük:
            - y_test: Gerçek test etiketleri
            - y_pred_prob: Tahmin olasılıkları
            - dataset_name: Dataset adı (opsiyonel)

    Example:
        >>> test_results = {'y_test': y_test, 'y_pred_prob': y_pred_prob}
        >>> plot_precision_recall_curve(test_results)
        # PR eğrisi ve AUC-PR değeri ile grafik çizilir
    """
    y_test = test_results['y_true']
    y_pred_prob = test_results['y_pred_proba']
    
    _, ax = plt.subplots(figsize=VisualizationConfig.FIGURE_SIZE_PR_CURVE)
    
    # PR eğrisi hesapla
    precision, recall, thresholds = precision_recall_curve(y_test, y_pred_prob)
    pr_auc = average_precision_score(y_test, y_pred_prob)
    
    # Pozitif sınıf oranını hesapla (baseline için)
    pos_ratio = sum(y_test) / len(y_test)
    
    colors = VisualizationConfig.COLORS
    ax.plot(recall, precision, color=colors['pr_curve'], linewidth=VisualizationConfig.LINE_WIDTH, 
            label=f'PR Eğrisi (AUC-PR = {pr_auc:.3f})')
    ax.axhline(y=pos_ratio, color=colors['random_line'], linestyle='--', linewidth=2, 
               label=f'Rastgele Sınıflandırma (AP = {pos_ratio:.3f})')
    
    ax.set_xlim([0.0, 1.0])
    ax.set_ylim([0.0, 1.05])
    ax.set_xlabel('Recall (Duyarlılık)', fontsize=VisualizationConfig.LABEL_FONT_SIZE, fontweight='bold')
    ax.set_ylabel('Precision (Kesinlik)', fontsize=VisualizationConfig.LABEL_FONT_SIZE, fontweight='bold')
    ax.set_title('Precision-Recall Curve', fontsize=VisualizationConfig.TITLE_FONT_SIZE, fontweight='bold')
    ax.legend(loc="lower left", fontsize=VisualizationConfig.LEGEND_FONT_SIZE)
    ax.grid(True, alpha=VisualizationConfig.GRID_ALPHA)

    plt.tight_layout()
    plt.show()

# reporting.py dosyasının sonuna eklenecek yeni fonksiyon

def raporla_performans_olcutleri(confusion_matrix):
    """
    Verilen bir 2x2 confusion matrix'ten tüm performans ölçütlerini hesaplar
    ve formatlanmış bir metin tablosu olarak döndürür.
    """
    try:
        tn, fp, fn, tp = confusion_matrix.ravel()

        # Metrik Hesaplamaları
        total = tp + tn + fp + fn
        accuracy = (tp + tn) / total if total > 0 else 0
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        specificity = tn / (tn + fp) if (tn + fp) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
        fnr = fn / (tp + fn) if (tp + fn) > 0 else 0
        mcc_numerator = (tp * tn) - (fp * fn)
        mcc_denominator = math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
        mcc = mcc_numerator / mcc_denominator if mcc_denominator > 0 else 0

        results = {
            "Accuracy": accuracy,
            "Precision": precision,
            "Recall (TPR)": recall,
            "Specificity (TNR)": specificity,
            "F1-Score": f1,
            "FPR": fpr,
            "FNR": fnr,
            "Matthews Corr. Coef. (MCC)": mcc
        }
        
        # Tablo metnini oluştur
        table = "\n" + "="*50 + "\n"
        table += "📊 PERFORMANS ÖLÇÜTLERİ RAPORU (TEST SETİ) 📊\n"
        table += "="*50 + "\n"
        table += f"┌{'─'*32}┬{'─'*15}┐\n"
        table += f"│ {'Metrik':<30} │ {'Değer':<13} │\n"
        table += f"├{'─'*32}┼{'─'*15}┤\n"
        for name, value in results.items():
            table += f"│ {name:<30} │ {value:<13.4f} │\n"
        table += f"└{'─'*32}┴{'─'*15}┘\n"
        
        return table

    except Exception as e:
        return f"\n❌ Performans metrikleri hesaplanırken bir hata oluştu: {e}"

def plot_performans_olcutleri(confusion_matrix):
    """
    Performans ölçütlerini görselleştirir - bar chart olarak gösterir.
    """
    try:
        import math
        tn, fp, fn, tp = confusion_matrix.ravel()

        # Metrik Hesaplamaları
        total = tp + tn + fp + fn
        accuracy = (tp + tn) / total if total > 0 else 0
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        specificity = tn / (tn + fp) if (tn + fp) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
        fnr = fn / (tp + fn) if (tp + fn) > 0 else 0
        mcc_numerator = (tp * tn) - (fp * fn)
        mcc_denominator = math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
        mcc = mcc_numerator / mcc_denominator if mcc_denominator > 0 else 0

        # Ana metrikler (0-1 arasında)
        main_metrics = {
            "Accuracy": accuracy,
            "Precision": precision,
            "Recall": recall,
            "Specificity": specificity,
            "F1-Score": f1
        }
        
        # Hata oranları
        error_metrics = {
            "FPR": fpr,
            "FNR": fnr
        }

        # İki ayrı grafik oluştur
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
        
        # Ana metrikler grafiği
        metrics_names = list(main_metrics.keys())
        metrics_values = list(main_metrics.values())
        
        colors = ['#2ecc71', '#3498db', '#e74c3c', '#f39c12', '#9b59b6']
        bars1 = ax1.bar(metrics_names, metrics_values, color=colors, alpha=0.8)
        
        # Değerleri bar'ların üstüne yaz
        for bar, value in zip(bars1, metrics_values):
            height = bar.get_height()
            ax1.text(bar.get_x() + bar.get_width()/2., height + 0.01,
                    f'{value:.3f}', ha='center', va='bottom', fontweight='bold')
        
        ax1.set_title('Ana Performans Metrikleri', fontsize=14, fontweight='bold', pad=20)
        ax1.set_ylabel('Değer', fontsize=12, fontweight='bold')
        ax1.set_ylim(0, 1.1)
        ax1.grid(True, alpha=0.3, axis='y')
        ax1.tick_params(axis='x', rotation=45)
        
        # Hata oranları grafiği
        error_names = list(error_metrics.keys())
        error_values = list(error_metrics.values())
        
        bars2 = ax2.bar(error_names, error_values, color=['#e74c3c', '#e67e22'], alpha=0.8)
        
        # Değerleri bar'ların üstüne yaz
        for bar, value in zip(bars2, error_values):
            height = bar.get_height()
            ax2.text(bar.get_x() + bar.get_width()/2., height + 0.01,
                    f'{value:.3f}', ha='center', va='bottom', fontweight='bold')
        
        ax2.set_title('Hata Oranları', fontsize=14, fontweight='bold', pad=20)
        ax2.set_ylabel('Oran', fontsize=12, fontweight='bold')
        ax2.set_ylim(0, max(max(error_values), 0.1) * 1.2)
        ax2.grid(True, alpha=0.3, axis='y')
        ax2.tick_params(axis='x', rotation=45)
        
        # MCC değerini ayrı bir text box olarak ekle
        textstr = f'Matthews Correlation Coefficient (MCC): {mcc:.4f}'
        props = dict(boxstyle='round', facecolor='lightblue', alpha=0.8)
        fig.text(0.5, 0.02, textstr, transform=fig.transFigure, fontsize=12,
                verticalalignment='bottom', horizontalalignment='center', bbox=props)
        
        plt.tight_layout()
        plt.subplots_adjust(bottom=0.15)  # MCC için yer bırak
        plt.show()
        
        print("✅ Performans ölçütleri görselleştirildi!")

    except Exception as e:
        print(f"❌ Performans ölçütleri görselleştirme hatası: {e}")

def plot_all_results(cv_scores, test_results):
    """Model performansının tüm görselleştirmelerini kapsamlı olarak oluşturur.

    CV ve test sonuçlarını görsel olarak analiz etmek için gerekli tüm grafikleri
    sırasıyla çizer. Training history, fold performansları, confusion matrix,
    CV vs test karşılaştırması ve ROC curve grafiklerini içerir.

    Args:
        cv_scores (dict): Cross validation sonuçları:
            - individual_scores (list): Her fold için detaylı metrikler
            - mean_* (float): Ortalama performans metrikleri
        test_results (dict): Test sonuçları:
            - history (tf.keras.History): Eğitim geçmişi
            - y_test, y_pred, y_pred_prob (array): Test verileri ve tahminler

    Note:
        Her grafik ayrı pencerede açılır. VisualizationConfig'ten renk ve 
        boyut ayarları kullanılır.

    Example:
        >>> plot_all_results(cv_scores, test_results)
        📈 Görselleştirmeler oluşturuluyor...
        🏋️‍♂️ Training History Grafiği
        📊 Fold Bazında Performans Grafiği
        🎯 Confusion Matrix
        ...
    """
    print(f"\n📈 Görselleştirmeler oluşturuluyor...")
    
    # 1. CV sonuçları yazdır
    if cv_scores:
        print_cv_results(cv_scores)
    
    # 2. Test sonuçları yazdır
    if test_results:
        print_test_results(test_results, cv_scores)
    
    # 3. Training history
    plot_training_history(test_results)
    
    # 4. Fold bazında performans
    plot_fold_performance(cv_scores)
    
    # 5. Confusion Matrix
    plot_confusion_matrix(test_results)
    
    # 6. Detaylı performans metrikleri raporu
    if test_results and 'y_true' in test_results and 'y_pred' in test_results:
        import math
        cm = confusion_matrix(test_results['y_true'], test_results['y_pred'])
        metrics_table = raporla_performans_olcutleri(cm)
        print(metrics_table)
        
        # 6b. Performans ölçütlerini görselleştir
        plot_performans_olcutleri(cm)
    
    # 7. CV vs Test karşılaştırması
    plot_cv_vs_test_comparison(test_results, cv_scores)
    
    # 8. ROC Curve
    plot_roc_curve(test_results)
    
    # 9. Precision-Recall Curve
    plot_precision_recall_curve(test_results)
    
    print(f"✅ Tüm görselleştirmeler tamamlandı!") 