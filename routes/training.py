"""
Training API Router — Model Eğitim Yönetimi

Web arayüzünden LSTM-CNN modelinin parametrelerini değiştirme,
eğitim başlatma, ilerlemeyi takip etme ve sonuç grafiklerini görüntüleme.
"""

import os
import time
import threading
import traceback
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Config imports
from config import ModelConfig, TrainingConfig

router = APIRouter(prefix="/api/training", tags=["Training"])

# ── Global Training State ───────────────────────────────────────────
_training_state: Dict[str, Any] = {
    "status": "idle",          # idle | running | completed | error
    "progress": 0,             # 0-100
    "current_epoch": 0,
    "total_epochs": 0,
    "current_phase": "",       # "cv" | "final" | "saving"
    "train_loss": None,
    "val_loss": None,
    "started_at": None,
    "completed_at": None,
    "error": None,
    "results": None,           # Final metrics dict
}

_training_lock = threading.Lock()

CHARTS_DIR = Path("Performans_Metrikleri")


# ── Request / Response Models ───────────────────────────────────────
class TrainingParams(BaseModel):
    # Model architecture
    cnn_filters: list = ModelConfig.CNN_FILTERS_PER_LAYER
    cnn_kernel_size: int = ModelConfig.CNN_KERNEL_SIZE
    cnn_dropout: float = ModelConfig.CNN_DROPOUT
    lstm_units: list = ModelConfig.LSTM_UNITS_PER_LAYER
    lstm_dropout: float = ModelConfig.LSTM_DROPOUT
    dense_units: list = ModelConfig.DENSE_UNITS_PER_LAYER
    dense_dropout: float = ModelConfig.DENSE_DROPOUT
    learning_rate: float = ModelConfig.LEARNING_RATE
    # Training
    epochs: int = TrainingConfig.FINAL_MODEL_EPOCHS
    batch_size: int = TrainingConfig.BATCH_SIZE
    cv_splits: int = TrainingConfig.CV_SPLITS
    use_smote: bool = TrainingConfig.USE_SMOTE
    threshold_method: str = TrainingConfig.THRESHOLD_OPTIMIZATION_METHOD
    early_stopping_patience: int = TrainingConfig.EARLY_STOPPING_PATIENCE


# ── Endpoints ───────────────────────────────────────────────────────

@router.get("/config")
def get_training_config():
    """Mevcut model ve eğitim konfigürasyonunu döndürür."""
    return {
        "model": {
            "cnn_filters": ModelConfig.CNN_FILTERS_PER_LAYER,
            "cnn_kernel_size": ModelConfig.CNN_KERNEL_SIZE,
            "cnn_pool_size": ModelConfig.CNN_POOL_SIZE,
            "cnn_dropout": ModelConfig.CNN_DROPOUT,
            "cnn_activation": ModelConfig.CNN_ACTIVATION,
            "lstm_units": ModelConfig.LSTM_UNITS_PER_LAYER,
            "lstm_dropout": ModelConfig.LSTM_DROPOUT,
            "dense_units": ModelConfig.DENSE_UNITS_PER_LAYER,
            "dense_dropout": ModelConfig.DENSE_DROPOUT,
            "dense_activation": ModelConfig.DENSE_ACTIVATION,
            "learning_rate": ModelConfig.LEARNING_RATE,
            "optimizer": ModelConfig.OPTIMIZER,
            "loss_function": ModelConfig.LOSS_FUNCTION,
        },
        "training": {
            "epochs": TrainingConfig.FINAL_MODEL_EPOCHS,
            "cv_epochs": TrainingConfig.EPOCHS,
            "batch_size": TrainingConfig.BATCH_SIZE,
            "cv_splits": TrainingConfig.CV_SPLITS,
            "test_size": TrainingConfig.TEST_SIZE,
            "validation_split": TrainingConfig.VALIDATION_SPLIT,
            "early_stopping_patience": TrainingConfig.EARLY_STOPPING_PATIENCE,
            "final_model_patience": TrainingConfig.FINAL_MODEL_PATIENCE,
            "use_smote": TrainingConfig.USE_SMOTE,
            "smote_k_neighbors": TrainingConfig.SMOTE_K_NEIGHBORS,
            "threshold_method": TrainingConfig.THRESHOLD_OPTIMIZATION_METHOD,
            "default_threshold": TrainingConfig.DEFAULT_THRESHOLD,
        },
    }


@router.post("/start")
def start_training(params: Optional[TrainingParams] = None):
    """
    Arka planda model eğitimini başlatır.
    Aynı anda sadece bir eğitim çalışabilir.
    """
    with _training_lock:
        if _training_state["status"] == "running":
            raise HTTPException(
                status_code=409,
                detail="Eğitim zaten devam ediyor. Lütfen tamamlanmasını bekleyin."
            )

        # Reset state
        _training_state.update({
            "status": "running",
            "progress": 0,
            "current_epoch": 0,
            "total_epochs": (params.epochs if params else TrainingConfig.FINAL_MODEL_EPOCHS),
            "current_phase": "initializing",
            "train_loss": None,
            "val_loss": None,
            "started_at": time.time(),
            "completed_at": None,
            "error": None,
            "results": None,
        })

    worker = threading.Thread(
        target=_training_worker,
        args=(params,),
        daemon=True
    )
    worker.start()

    return {
        "status": "started",
        "message": "Model eğitimi arka planda başlatıldı.",
        "total_epochs": _training_state["total_epochs"],
    }


@router.get("/status")
def get_training_status():
    """Aktif eğitimin anlık durumunu döndürür."""
    elapsed = None
    if _training_state["started_at"]:
        end = _training_state["completed_at"] or time.time()
        elapsed = round(end - _training_state["started_at"], 1)

    return {
        "status": _training_state["status"],
        "progress": _training_state["progress"],
        "current_epoch": _training_state["current_epoch"],
        "total_epochs": _training_state["total_epochs"],
        "current_phase": _training_state["current_phase"],
        "train_loss": _training_state["train_loss"],
        "val_loss": _training_state["val_loss"],
        "elapsed_seconds": elapsed,
        "error": _training_state["error"],
    }


@router.get("/results")
def get_training_results():
    """Son tamamlanan eğitimin sonuçlarını ve grafik listesini döndürür."""
    if _training_state["status"] == "running":
        raise HTTPException(status_code=409, detail="Eğitim devam ediyor.")

    if _training_state["results"] is None:
        raise HTTPException(status_code=404, detail="Henüz tamamlanmış bir eğitim yok.")

    # Discover available chart images
    charts = []
    if CHARTS_DIR.exists():
        for f in sorted(CHARTS_DIR.glob("*.png")):
            charts.append({
                "name": f.stem.replace("_", " ").title(),
                "filename": f.name,
                "url": f"/api/training/charts/{f.name}",
            })

    elapsed = None
    if _training_state["started_at"] and _training_state["completed_at"]:
        elapsed = round(_training_state["completed_at"] - _training_state["started_at"], 1)

    return {
        "status": _training_state["status"],
        "metrics": _training_state["results"],
        "charts": charts,
        "elapsed_seconds": elapsed,
    }


@router.get("/charts/{filename}")
def get_chart(filename: str):
    """Eğitim sonuç grafiklerini statik dosya olarak serve eder."""
    file_path = CHARTS_DIR / filename
    if not file_path.exists() or not file_path.suffix == ".png":
        raise HTTPException(status_code=404, detail="Grafik bulunamadı.")
    return FileResponse(str(file_path), media_type="image/png")


# ── Training Worker ─────────────────────────────────────────────────

def _training_worker(params: Optional[TrainingParams]):
    """Arka plan thread'inde model eğitimini çalıştırır."""
    import matplotlib
    matplotlib.use("Agg")  # Headless — GUI yok

    try:
        # Apply custom params to config classes (temporary override)
        if params:
            _apply_params(params)

        _training_state["current_phase"] = "loading_data"
        _training_state["progress"] = 5

        # Import training utilities
        import training_utils
        import reporting

        # Suppress plt.show() for headless mode
        import matplotlib.pyplot as plt
        plt.show = lambda *a, **kw: None

        # Progress update function for real-time monitoring
        def update_progress(phase, current_epoch, total_epochs, train_loss, val_loss):
            _training_state["current_phase"] = phase
            _training_state["current_epoch"] = current_epoch
            _training_state["total_epochs"] = total_epochs
            
            if train_loss is not None:
                _training_state["train_loss"] = round(float(train_loss), 6)
            
            if val_loss is not None:
                _training_state["val_loss"] = round(float(val_loss), 6)
            
            # Calculate overall progress
            base_progress = 0
            if "Cross Validation" in phase:
                # Parse fold info: "Cross Validation (Fold 1/5)"
                import re
                match = re.search(r"Fold (\d+)/(\d+)", phase)
                if match:
                    fold = int(match.group(1))
                    total_folds = int(match.group(2))
                    # CV phase covers 15% -> 50% (Range: 35%)
                    cv_range = 35
                    fold_range = cv_range / total_folds
                    fold_start_progress = 15 + (fold - 1) * fold_range
                    current_fold_progress = (current_epoch / total_epochs) * fold_range
                    base_progress = fold_start_progress + current_fold_progress
                else:
                    # Fallback if no fold info
                    base_progress = 15 + (current_epoch / total_epochs) * 35
            
            elif "Final Training" in phase:
                # Final training covers 50% -> 80% (Range: 30%)
                base_progress = 50 + (current_epoch / total_epochs) * 30
            
            _training_state["progress"] = min(99, int(base_progress))

        trainer = training_utils.PdMModelTrainer(progress_callback=update_progress)

        # ── Phase 1: Load data ──────────────────────────────
        _training_state["current_phase"] = "loading_data"
        _training_state["progress"] = 8
        trainer.load_data()

        # ── Phase 2: Cross Validation ───────────────────────
        _training_state["current_phase"] = "cross_validation"
        _training_state["progress"] = 15
        cv_results = trainer.run_cv()

        _training_state["progress"] = 50

        # ── Phase 3: Final Model Training ───────────────────
        _training_state["current_phase"] = "final_training"
        test_results = trainer.train_final()

        # Extract training history for live updates
        # (Callback already handles this, but we keep final state update)
        if test_results and "history" in test_results:
            history = test_results["history"]
            epochs_run = len(history.get("loss", []))
            # _training_state["current_epoch"] = epochs_run # Callback sets this
            if history.get("loss"):
                _training_state["train_loss"] = round(float(history["loss"][-1]), 6)
            if history.get("val_loss"):
                _training_state["val_loss"] = round(float(history["val_loss"][-1]), 6)

        _training_state["progress"] = 80

        # ── Phase 4: Save model ─────────────────────────────
        _training_state["current_phase"] = "saving_model"
        trainer.save_models()

        _training_state["progress"] = 85

        # ── Phase 5: Generate charts ────────────────────────
        _training_state["current_phase"] = "generating_charts"

        try:
            reporting.plot_all_results(cv_results, test_results)
        except Exception as chart_err:
            print(f"⚠️ Grafik oluşturma hatası (kritik değil): {chart_err}")

        _training_state["progress"] = 95

        # ── Phase 6: Collect result metrics ─────────────────
        _training_state["current_phase"] = "collecting_results"

        import numpy as np
        metrics = _extract_metrics(cv_results, test_results, trainer)

        _training_state["results"] = metrics
        _training_state["progress"] = 100
        _training_state["status"] = "completed"
        _training_state["completed_at"] = time.time()
        _training_state["current_phase"] = "done"

        print("✅ Web eğitimi tamamlandı!")

        # ── Phase 7: Blockchain eğitim kaydı (ZK proof + gas) ─────────
        _training_state["current_phase"] = "recording_on_blockchain"
        try:
            from routes.dependencies import get_blockchain_handler
            import hashlib as _hashlib

            bc = get_blockchain_handler()
            if bc and bc.is_ready():
                model_path = Path("build/model.h5")
                model_bytes = model_path.read_bytes() if model_path.exists() else b""
                model_hash_int = int(_hashlib.sha256(model_bytes).hexdigest(), 16)

                hyperparams = {
                    'learning_rate':          ModelConfig.LEARNING_RATE,
                    'epochs':                 TrainingConfig.FINAL_MODEL_EPOCHS,
                    'batch_size':             TrainingConfig.BATCH_SIZE,
                    'cv_splits':              TrainingConfig.CV_SPLITS,
                    'early_stop_patience':    TrainingConfig.FINAL_MODEL_PATIENCE,
                    'cv_lr':                  ModelConfig.LEARNING_RATE,
                    'cv_epochs':              TrainingConfig.EPOCHS,
                    'cv_early_stop_patience': TrainingConfig.EARLY_STOPPING_PATIENCE,
                    'cnn_filters':            ModelConfig.CNN_FILTERS_PER_LAYER,
                    'cnn_kernel_size':        ModelConfig.CNN_KERNEL_SIZE,
                    'cnn_dropout':            ModelConfig.CNN_DROPOUT,
                    'cnn_pool_size':          ModelConfig.CNN_POOL_SIZE,
                    'lstm_units':             ModelConfig.LSTM_UNITS_PER_LAYER,
                    'lstm_dropout':           ModelConfig.LSTM_DROPOUT,
                    'dense_units':            ModelConfig.DENSE_UNITS_PER_LAYER,
                    'dense_dropout':          ModelConfig.DENSE_DROPOUT,
                    'threshold_method':       TrainingConfig.THRESHOLD_OPTIMIZATION_METHOD,
                }

                bc_result = bc.submit_training_record(
                    model_hash_int=model_hash_int,
                    hyperparams=hyperparams
                )
                if bc_result.get('success'):
                    print(f"✅ Eğitim blockchain'e kaydedildi: {bc_result['tx_hash']}")
                    _training_state["blockchain_tx"] = bc_result['tx_hash']
                else:
                    print(f"⚠️ Blockchain eğitim kaydı başarısız: {bc_result.get('error')}")
        except Exception as bc_err:
            print(f"⚠️ Blockchain eğitim kaydı başarısız (kritik değil): {bc_err}")

        _training_state["current_phase"] = "done"

        # Reload model in api_main globals
        _reload_api_model()

    except Exception as e:
        _training_state["status"] = "error"
        _training_state["error"] = str(e)
        _training_state["completed_at"] = time.time()
        print(f"❌ Eğitim hatası: {e}")
        traceback.print_exc()

    finally:
        # Restore original config values
        if params:
            _restore_params()


def _apply_params(params: TrainingParams):
    """Custom parametreleri geçici olarak config sınıflarına uygular."""
    # Save originals
    _training_state["_orig_model"] = {
        "CNN_FILTERS_PER_LAYER": ModelConfig.CNN_FILTERS_PER_LAYER,
        "CNN_KERNEL_SIZE": ModelConfig.CNN_KERNEL_SIZE,
        "CNN_DROPOUT": ModelConfig.CNN_DROPOUT,
        "LSTM_UNITS_PER_LAYER": ModelConfig.LSTM_UNITS_PER_LAYER,
        "LSTM_DROPOUT": ModelConfig.LSTM_DROPOUT,
        "DENSE_UNITS_PER_LAYER": ModelConfig.DENSE_UNITS_PER_LAYER,
        "DENSE_DROPOUT": ModelConfig.DENSE_DROPOUT,
        "LEARNING_RATE": ModelConfig.LEARNING_RATE,
    }
    _training_state["_orig_train"] = {
        "FINAL_MODEL_EPOCHS": TrainingConfig.FINAL_MODEL_EPOCHS,
        "BATCH_SIZE": TrainingConfig.BATCH_SIZE,
        "CV_SPLITS": TrainingConfig.CV_SPLITS,
        "USE_SMOTE": TrainingConfig.USE_SMOTE,
        "THRESHOLD_OPTIMIZATION_METHOD": TrainingConfig.THRESHOLD_OPTIMIZATION_METHOD,
        "EARLY_STOPPING_PATIENCE": TrainingConfig.EARLY_STOPPING_PATIENCE,
    }

    # Apply overrides
    ModelConfig.CNN_FILTERS_PER_LAYER = params.cnn_filters
    ModelConfig.CNN_KERNEL_SIZE = params.cnn_kernel_size
    ModelConfig.CNN_DROPOUT = params.cnn_dropout
    ModelConfig.LSTM_UNITS_PER_LAYER = params.lstm_units
    ModelConfig.LSTM_DROPOUT = params.lstm_dropout
    ModelConfig.DENSE_UNITS_PER_LAYER = params.dense_units
    ModelConfig.DENSE_DROPOUT = params.dense_dropout
    ModelConfig.LEARNING_RATE = params.learning_rate

    TrainingConfig.FINAL_MODEL_EPOCHS = params.epochs
    TrainingConfig.BATCH_SIZE = params.batch_size
    TrainingConfig.CV_SPLITS = params.cv_splits
    TrainingConfig.USE_SMOTE = params.use_smote
    TrainingConfig.THRESHOLD_OPTIMIZATION_METHOD = params.threshold_method
    TrainingConfig.EARLY_STOPPING_PATIENCE = params.early_stopping_patience


def _restore_params():
    """Config sınıflarını orijinal değerlerine geri yükler."""
    orig_model = _training_state.pop("_orig_model", {})
    for k, v in orig_model.items():
        setattr(ModelConfig, k, v)

    orig_train = _training_state.pop("_orig_train", {})
    for k, v in orig_train.items():
        setattr(TrainingConfig, k, v)


def _extract_metrics(cv_results, test_results, trainer) -> Dict[str, Any]:
    """Eğitim sonuçlarından metrik sözlüğü çıkarır."""
    import numpy as np

    metrics: Dict[str, Any] = {
        "optimal_threshold": float(trainer.optimal_threshold) if trainer.optimal_threshold else 0.5,
    }

    # CV metrics
    if cv_results:
        for key in ["accuracy", "precision", "recall", "f1", "auc"]:
            vals = cv_results.get(key, [])
            if vals:
                metrics[f"cv_{key}_mean"] = round(float(np.mean(vals)), 4)
                metrics[f"cv_{key}_std"] = round(float(np.std(vals)), 4)

    # Test metrics
    if test_results:
        opt = test_results.get("optimal_threshold_results", {})
        for key in ["accuracy", "precision", "recall", "f1"]:
            if key in opt:
                metrics[f"test_{key}"] = round(float(opt[key]), 4)

        if "y_true" in test_results and "y_pred_proba" in test_results:
            from sklearn.metrics import roc_auc_score
            try:
                auc = roc_auc_score(test_results["y_true"], test_results["y_pred_proba"])
                metrics["test_auc"] = round(float(auc), 4)
            except Exception:
                pass

        # Confusion matrix
        if "y_true" in test_results and "y_pred" in test_results:
            from sklearn.metrics import confusion_matrix as cm_func
            try:
                cm = cm_func(test_results["y_true"], test_results["y_pred"])
                tn, fp, fn, tp = cm.ravel()
                metrics["confusion_matrix"] = {
                    "tn": int(tn), "fp": int(fp),
                    "fn": int(fn), "tp": int(tp),
                }
            except Exception:
                pass

        # Training history summary
        history = test_results.get("history", {})
        if history:
            metrics["epochs_run"] = len(history.get("loss", []))
            if history.get("loss"):
                metrics["final_train_loss"] = round(float(history["loss"][-1]), 6)
            if history.get("val_loss"):
                metrics["final_val_loss"] = round(float(history["val_loss"][-1]), 6)

    return metrics


def _reload_api_model():
    """Eğitim sonrası yeni modeli API'de yükler."""
    try:
        import tensorflow as tf
        import joblib
        from config import FilePaths

        model = tf.keras.models.load_model(FilePaths.MODEL_PATH, compile=False)
        scaler = joblib.load(FilePaths.SCALER_PATH)

        # Update api_main globals
        import api_main
        api_main.model = model
        api_main.scaler = scaler

        # Update optimal threshold from metadata
        metadata_path = FilePaths.MODEL_PATH.parent / "model_metadata.pkl"
        if metadata_path.exists():
            metadata = joblib.load(metadata_path)
            threshold = metadata.get("optimal_threshold")
            if threshold:
                api_main.optimal_threshold = float(threshold)

        # Update predictions module
        from routes import predictions
        predictions.set_model_refs(
            model, scaler, api_main.optimal_threshold, api_main.feature_names
        )

        print("✅ API modeli güncel versiyon ile yeniden yüklendi.")
    except Exception as e:
        print(f"⚠️ Model yeniden yükleme hatası: {e}")
