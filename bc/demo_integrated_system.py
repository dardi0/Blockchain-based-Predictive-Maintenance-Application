#!/usr/bin/env python3
"""
Integrated PDM System Demo
==========================

Bu demo, UniversalFailureVerifier ve PdMSystemIntegrated kontratlarının
birlikte çalışmasını gösterir. Tam bir iş akışı simülasyonu sunar:

1. Sensör verisi gönderme
2. Tahmin oluşturma 
3. Arıza kanıtı gönderme (UniversalFailureVerifier)
4. Kanıtı ana sisteme bağlama
5. Otomatik bakım görevi oluşturma
6. İstatistik ve raporlama

Bu gerçek bir production ortamındaki tam workflow'u temsil eder.
"""

import json
import time
import hashlib
from datetime import datetime, timedelta

# Renkli konsol çıktısı
class Colors:
    RESET = '\033[0m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RED = '\033[91m'
    CYAN = '\033[96m'
    MAGENTA = '\033[95m'
    BOLD = '\033[1m'

def log(message, color=Colors.RESET):
    print(f"{color}{message}{Colors.RESET}")

def log_step(step, message):
    log(f"\n{Colors.CYAN}{step}{Colors.RESET} {Colors.BOLD}{message}{Colors.RESET}")

def log_success(message):
    log(f"{Colors.GREEN}✅ {message}{Colors.RESET}")

def log_error(message):
    log(f"{Colors.RED}❌ {message}{Colors.RESET}")

def log_warning(message):
    log(f"{Colors.YELLOW}⚠️ {message}{Colors.RESET}")

def log_info(message):
    log(f"{Colors.BLUE}ℹ️ {message}{Colors.RESET}")

class IntegratedPDMDemo:
    def __init__(self):
        self.failure_types = {
            0: "NONE",
            1: "TWF (Tool Wear Failure)",
            2: "HDF (Heat Dissipation Failure)", 
            3: "PWF (Power Failure)",
            4: "OSF (Overstrain Failure)",
            5: "RNF (Random Failure)"
        }
        
        self.machine_types = {
            0: "NONE",
            1: "L_TYPE (Low Quality)",
            2: "M_TYPE (Medium Quality)", 
            3: "H_TYPE (High Quality)"
        }
        
        self.severity_levels = {
            0: "NORMAL",
            1: "LOW", 
            2: "MEDIUM",
            3: "HIGH",
            4: "CRITICAL"
        }
        
        # Simulated contract states
        self.users = {}
        self.sensor_data = {}
        self.predictions = {}
        self.failure_proofs = {}
        self.maintenance_tasks = {}
        
        # Counters
        self.data_counter = 1
        self.prediction_counter = 1
        self.proof_counter = 1
        self.task_counter = 1
        
        # Contract addresses (simulated)
        self.failure_verifier_address = "0x1234567890123456789012345678901234567890"
        self.pdm_system_address = "0x9876543210987654321098765432109876543210"
        
    def calculate_sensor_hash(self, sensor_data, nonce):
        """AI4I2020 sensör verisi için hash hesaplama"""
        data_string = (
            f"{sensor_data['air_temperature']}"
            f"{sensor_data['process_temperature']}"
            f"{sensor_data['rotational_speed']}"
            f"{sensor_data['torque']}"
            f"{sensor_data['tool_wear']}"
            f"{nonce}"
        )
        hash_bytes = hashlib.sha256(data_string.encode()).digest()
        return "0x" + hash_bytes.hex()
        
    def analyze_failure_from_sensor_data(self, sensor_data, machine_type):
        """Sensör verisinden otomatik arıza analizi"""
        
        # Türetilmiş değerler hesapla
        temp_diff = sensor_data["process_temperature"] - sensor_data["air_temperature"]
        power_estimate = sensor_data["torque"] * sensor_data["rotational_speed"]
        overstrain_product = sensor_data["torque"] * sensor_data["tool_wear"]
        
        analysis = {
            "failure_detected": False,
            "failure_type": 0,
            "severity": 0,
            "confidence": 85,
            "factors": [],
            "derived_values": {
                "temp_difference": temp_diff,
                "power_estimate": power_estimate,
                "overstrain_product": overstrain_product
            }
        }
        
        # TWF kontrolü
        if sensor_data["tool_wear"] >= 200:
            analysis["failure_detected"] = True
            analysis["failure_type"] = 1  # TWF
            analysis["severity"] = 4      # CRITICAL
            analysis["factors"].append(f"Tool wear: {sensor_data['tool_wear']} min ≥ 200 (CRITICAL)")
            
        # HDF kontrolü
        elif temp_diff < 8.6 and sensor_data["rotational_speed"] < 1380:
            analysis["failure_detected"] = True
            analysis["failure_type"] = 2  # HDF
            analysis["severity"] = 3      # HIGH
            analysis["factors"].extend([
                f"Temperature difference: {temp_diff:.1f}K < 8.6K",
                f"Rotational speed: {sensor_data['rotational_speed']} < 1380 rpm"
            ])
            
        # PWF kontrolü
        elif power_estimate < 3500 or power_estimate > 9000:
            analysis["failure_detected"] = True
            analysis["failure_type"] = 3  # PWF
            analysis["severity"] = 3 if power_estimate > 9000 else 2
            if power_estimate < 3500:
                analysis["factors"].append(f"Power too low: {power_estimate:.0f}W < 3500W")
            else:
                analysis["factors"].append(f"Power too high: {power_estimate:.0f}W > 9000W")
                
        # OSF kontrolü
        else:
            osf_limits = {1: 11000, 2: 12000, 3: 13000}
            limit = osf_limits.get(machine_type, 12000)
            
            if overstrain_product > limit:
                analysis["failure_detected"] = True
                analysis["failure_type"] = 4  # OSF
                analysis["severity"] = 4      # CRITICAL
                analysis["factors"].append(f"Overstrain: {overstrain_product:.0f} > {limit}")
        
        return analysis
        
    def simulate_sensor_data_submission(self, machine_id, scenario_name, sensor_data, machine_type):
        """Sensör verisi gönderme simülasyonu"""
        
        log_step("📊", f"Sensör Verisi Gönderme: {scenario_name}")
        
        # Data commitment oluştur
        nonce = int(time.time()) % 100000
        data_commitment = self.calculate_sensor_hash(sensor_data, nonce)
        metadata_hash = hashlib.sha256(f"metadata_{machine_id}_{time.time()}".encode()).hexdigest()
        
        # Sensör verilerini göster
        log("   📊 AI4I2020 Sensör Verileri:")
        log(f"      🌡️ Hava Sıcaklığı: {sensor_data['air_temperature']/100:.1f} K")
        log(f"      🔥 İşlem Sıcaklığı: {sensor_data['process_temperature']/100:.1f} K")
        log(f"      ⚡ Dönme Hızı: {sensor_data['rotational_speed']} rpm")
        log(f"      🔧 Tork: {sensor_data['torque']/100:.1f} Nm")
        log(f"      ⏱️ Takım Aşınması: {sensor_data['tool_wear']} dk")
        log(f"      🏭 Makine Tipi: {self.machine_types[machine_type]}")
        
        # Contract çağrısı simüle et
        data_id = self.data_counter
        self.sensor_data[data_id] = {
            "data_commitment": data_commitment,
            "metadata_hash": f"0x{metadata_hash}",
            "submitter": "0xE8a00a012E2dd82031ca72020fE0A9e50691488F",  # Engineer address
            "timestamp": int(time.time()),
            "machine_id": machine_id,
            "required_role": "ENGINEER_ROLE",
            **sensor_data,
            "machine_type": machine_type,
            "nonce": nonce
        }
        self.data_counter += 1
        
        log_success(f"Sensör verisi kaydedildi - Data ID: {data_id}")
        log(f"   🔗 Data Commitment: {data_commitment[:20]}...")
        
        return data_id, data_commitment
        
    def simulate_prediction_storage(self, machine_id, data_id, prediction, probability):
        """Tahmin kaydetme simülasyonu"""
        
        log_step("🔮", "Tahmin Kaydetme")
        
        prediction_id = self.prediction_counter
        self.predictions[prediction_id] = {
            "machine_id": machine_id,
            "prediction": prediction,
            "probability": probability,
            "predictor": "0xE8a00a012E2dd82031ca72020fE0A9e50691488F",
            "timestamp": int(time.time()),
            "has_failure_proof": False,
            "failure_proof_id": "0x0",
            "detected_failure_type": 0,
            "severity": 0,
            "data_id": data_id
        }
        self.prediction_counter += 1
        
        log_success(f"Tahmin kaydedildi - Prediction ID: {prediction_id}")
        log(f"   🎯 Tahmin: {prediction} ({'Arıza' if prediction == 1 else 'Normal'})")
        log(f"   📊 Olasılık: {probability/100:.1f}%")
        log(f"   📋 Veri Kaynağı: Data ID {data_id}")
        
        return prediction_id
        
    def simulate_failure_proof_submission(self, sensor_data, machine_type, analysis):
        """UniversalFailureVerifier'a arıza kanıtı gönderme"""
        
        log_step("🔐", "Arıza Kanıtı Gönderme (UniversalFailureVerifier)")
        
        if not analysis["failure_detected"]:
            log_warning("Arıza tespit edilmediği için kanıt gönderilmiyor")
            return None
            
        # ZK Proof simülasyonu
        log("   🔐 ZK Proof Oluşturuluyor...")
        time.sleep(0.5)  # Proof generation simülasyonu
        
        proof_id = f"0x{hashlib.sha256(f'proof_{self.proof_counter}_{time.time()}'.encode()).hexdigest()}"
        
        # Simulated ZK proof data
        zkProof = {
            "a": ["0x123456", "0x789abc"],
            "b": [["0xdef012", "0x345678"], ["0x9abcde", "0xf01234"]],
            "c": ["0x567890", "0xabcdef"],
            "public_signals": [
                str(int(sensor_data["air_temperature"])),
                str(analysis["failure_type"]),
                str(machine_type),
                str(int(time.time())),
                "1",  # failure detected
                str(analysis["severity"])
            ]
        }
        
        # UniversalFailureVerifier.submitFailureProof() simülasyonu
        self.failure_proofs[proof_id] = {
            "proof_id": proof_id,
            "prover": "0xE8a00a012E2dd82031ca72020fE0A9e50691488F",
            "failure_type": analysis["failure_type"],
            "machine_type": machine_type,
            "severity": analysis["severity"],
            "confidence_score": analysis["confidence"],
            "data_commitment": self.sensor_data[self.data_counter-1]["data_commitment"],
            "timestamp": int(time.time()),
            "is_verified": False,
            "verified_by": "0x0",
            "verification_time": 0,
            "additional_data": json.dumps({
                "factors": analysis["factors"],
                "derived_values": analysis["derived_values"]
            }),
            "zk_proof": zkProof
        }
        self.proof_counter += 1
        
        log_success("ZK Proof başarıyla UniversalFailureVerifier'a gönderildi!")
        log(f"   🆔 Proof ID: {proof_id[:20]}...")
        log(f"   🔧 Arıza Türü: {self.failure_types[analysis['failure_type']]}")
        log(f"   🏭 Makine Tipi: {self.machine_types[machine_type]}")
        log(f"   ⚠️ Şiddet: {self.severity_levels[analysis['severity']]}")
        log(f"   🎯 Güven: {analysis['confidence']}%")
        log(f"   📋 Faktörler:")
        for factor in analysis["factors"]:
            log(f"      • {factor}")
            
        return proof_id
        
    def simulate_proof_verification(self, proof_id):
        """Manager tarafından kanıt doğrulama"""
        
        log_step("👨‍💼", "Manager Doğrulaması")
        
        if proof_id not in self.failure_proofs:
            log_error("Proof bulunamadı")
            return False
            
        proof = self.failure_proofs[proof_id]
        
        # Manager verification
        proof["is_verified"] = True
        proof["verified_by"] = "0x2A7D5D123456789012345678901234567890ABCD"  # Manager address
        proof["verification_time"] = int(time.time())
        
        log_success("Proof Manager tarafından doğrulandı!")
        log(f"   👨‍💼 Doğrulayan: {proof['verified_by'][:20]}...")
        log(f"   ⏰ Doğrulama Zamanı: {datetime.fromtimestamp(proof['verification_time']).strftime('%H:%M:%S')}")
        
        return True
        
    def simulate_proof_linking(self, prediction_id, proof_id):
        """Kanıtı ana sisteme bağlama"""
        
        log_step("🔗", "Kanıt Bağlama (PdMSystemIntegrated)")
        
        if prediction_id not in self.predictions or proof_id not in self.failure_proofs:
            log_error("Prediction veya Proof bulunamadı")
            return False
            
        prediction = self.predictions[prediction_id]
        proof = self.failure_proofs[proof_id]
        
        if not proof["is_verified"]:
            log_error("Proof henüz doğrulanmamış")
            return False
            
        # PdMSystemIntegrated.linkFailureProof() simülasyonu
        prediction["has_failure_proof"] = True
        prediction["failure_proof_id"] = proof_id
        prediction["detected_failure_type"] = proof["failure_type"]
        prediction["severity"] = proof["severity"]
        
        log_success("Proof başarıyla ana sisteme bağlandı!")
        log(f"   🔗 Prediction ID: {prediction_id}")
        log(f"   🆔 Proof ID: {proof_id[:20]}...")
        log(f"   🔧 Bağlanan Arıza: {self.failure_types[proof['failure_type']]}")
        
        # Otomatik bakım görevi oluşturma kontrolü
        if proof["severity"] >= 3:  # HIGH veya CRITICAL
            task_id = self._create_maintenance_task(prediction["machine_id"], proof_id, proof)
            log_info(f"Otomatik bakım görevi oluşturuldu - Task ID: {task_id}")
            
        return True
        
    def _create_maintenance_task(self, machine_id, proof_id, proof):
        """Otomatik bakım görevi oluşturma"""
        
        task_id = self.task_counter
        
        # Priority'ye göre scheduling
        now = datetime.now()
        if proof["severity"] == 4:  # CRITICAL
            scheduled_time = now + timedelta(hours=1)
            priority_text = "ACIL"
        elif proof["severity"] == 3:  # HIGH
            scheduled_time = now + timedelta(hours=24)
            priority_text = "YÜKSEK"
        else:
            scheduled_time = now + timedelta(days=7)
            priority_text = "ORTA"
            
        description = f"{self.failure_types[proof['failure_type']]} - {priority_text} Öncelik"
        
        self.maintenance_tasks[task_id] = {
            "task_id": task_id,
            "machine_id": machine_id,
            "failure_proof_id": proof_id,
            "failure_type": proof["failure_type"],
            "priority": proof["severity"],
            "assigned_engineer": "0x0",  # Henüz atanmamış
            "created_at": int(time.time()),
            "scheduled_at": int(scheduled_time.timestamp()),
            "completed_at": 0,
            "is_completed": False,
            "description": description,
            "completion_notes": ""
        }
        
        self.task_counter += 1
        return task_id
        
    def simulate_maintenance_workflow(self, task_id):
        """Bakım iş akışı simülasyonu"""
        
        log_step("🔧", "Bakım İş Akışı")
        
        if task_id not in self.maintenance_tasks:
            log_error("Bakım görevi bulunamadı")
            return
            
        task = self.maintenance_tasks[task_id]
        
        # Engineer assignment
        engineer_address = "0xABCDEF1234567890123456789012345678901234"
        task["assigned_engineer"] = engineer_address
        
        log_success(f"Bakım görevi atandı - Engineer: {engineer_address[:20]}...")
        log(f"   📋 Görev: {task['description']}")
        log(f"   ⏰ Planlanan: {datetime.fromtimestamp(task['scheduled_at']).strftime('%Y-%m-%d %H:%M')}")
        
        # Simulate completion
        time.sleep(1)
        task["is_completed"] = True
        task["completed_at"] = int(time.time())
        task["completion_notes"] = f"{self.failure_types[task['failure_type']]} arızası giderildi. Gerekli parçalar değiştirildi."
        
        log_success("Bakım görevi tamamlandı!")
        log(f"   ✅ Tamamlanma: {datetime.fromtimestamp(task['completed_at']).strftime('%Y-%m-%d %H:%M')}")
        log(f"   📝 Notlar: {task['completion_notes']}")
        
    def generate_system_report(self):
        """Sistem raporu oluşturma"""
        
        log_step("📊", "Sistem Raporu")
        
        # İstatistikler hesapla
        total_predictions = len(self.predictions)
        predictions_with_proof = len([p for p in self.predictions.values() if p["has_failure_proof"]])
        total_proofs = len(self.failure_proofs)
        verified_proofs = len([p for p in self.failure_proofs.values() if p["is_verified"]])
        total_tasks = len(self.maintenance_tasks)
        completed_tasks = len([t for t in self.maintenance_tasks.values() if t["is_completed"]])
        
        # Arıza türü istatistikleri
        failure_type_counts = {}
        for proof in self.failure_proofs.values():
            ft = proof["failure_type"]
            failure_type_counts[ft] = failure_type_counts.get(ft, 0) + 1
            
        log("   📈 Genel İstatistikler:")
        log(f"      • Toplam Tahmin: {total_predictions}")
        log(f"      • Kanıtlı Tahmin: {predictions_with_proof}")
        log(f"      • Toplam Kanıt: {total_proofs}")
        log(f"      • Doğrulanmış Kanıt: {verified_proofs}")
        log(f"      • Toplam Bakım Görevi: {total_tasks}")
        log(f"      • Tamamlanan Görev: {completed_tasks}")
        
        if total_predictions > 0:
            proof_rate = (predictions_with_proof / total_predictions) * 100
            log(f"      • Kanıt Oranı: {proof_rate:.1f}%")
            
        if total_proofs > 0:
            verification_rate = (verified_proofs / total_proofs) * 100
            log(f"      • Doğrulama Oranı: {verification_rate:.1f}%")
            
        if total_tasks > 0:
            completion_rate = (completed_tasks / total_tasks) * 100
            log(f"      • Tamamlanma Oranı: {completion_rate:.1f}%")
            
        log("   🔧 Arıza Türü Dağılımı:")
        for failure_type, count in failure_type_counts.items():
            percentage = (count / total_proofs) * 100 if total_proofs > 0 else 0
            log(f"      • {self.failure_types[failure_type]}: {count} ({percentage:.1f}%)")
            
        # Severity dağılımı
        severity_counts = {}
        for proof in self.failure_proofs.values():
            severity = proof["severity"]
            severity_counts[severity] = severity_counts.get(severity, 0) + 1
            
        log("   ⚠️ Şiddet Seviyesi Dağılımı:")
        for severity, count in severity_counts.items():
            percentage = (count / total_proofs) * 100 if total_proofs > 0 else 0
            log(f"      • {self.severity_levels[severity]}: {count} ({percentage:.1f}%)")
            
    def run_comprehensive_demo(self):
        """Kapsamlı entegre sistem demo'su"""
        
        log(f"{Colors.BOLD}{Colors.BLUE}")
        log("╔═══════════════════════════════════════════════════════════════╗")
        log("║                🏭 INTEGRATED PDM SYSTEM DEMO                 ║")
        log("║        UniversalFailureVerifier + PdMSystemIntegrated        ║")
        log("╚═══════════════════════════════════════════════════════════════╝")
        log(f"{Colors.RESET}")
        
        log(f"\n{Colors.YELLOW}🏗️ Sistem Mimarisi:{Colors.RESET}")
        log(f"   📋 UniversalFailureVerifier: {self.failure_verifier_address[:20]}...")
        log(f"   🏭 PdMSystemIntegrated: {self.pdm_system_address[:20]}...")
        log(f"   🔗 Entegrasyon: Arıza kanıtları merkezi yönetim")
        
        # Test senaryoları
        scenarios = [
            {
                "name": "🔧 KRİTİK TWF ARIZI",
                "machine_id": 101,
                "sensor_data": {
                    "air_temperature": 29920,      # 299.20K
                    "process_temperature": 30940,   # 309.40K
                    "rotational_speed": 1551,
                    "torque": 4280,                 # 42.80 Nm
                    "tool_wear": 220                # KRİTİK!
                },
                "machine_type": 2,  # M_TYPE
                "prediction": 1,
                "probability": 9200
            },
            {
                "name": "🌡️ HDF ISI ARIZI",
                "machine_id": 102,
                "sensor_data": {
                    "air_temperature": 30150,      # 301.50K
                    "process_temperature": 30980,   # 309.80K (fark: 8.3K < 8.6K)
                    "rotational_speed": 1200,       # < 1380
                    "torque": 3520,                 # 35.20 Nm
                    "tool_wear": 45
                },
                "machine_type": 1,  # L_TYPE
                "prediction": 1,
                "probability": 8750
            },
            {
                "name": "⚡ PWF GÜÇ ARIZI",
                "machine_id": 103,
                "sensor_data": {
                    "air_temperature": 29810,      # 298.10K
                    "process_temperature": 30860,   # 308.60K
                    "rotational_speed": 2800,
                    "torque": 6550,                 # 65.50 Nm
                    "tool_wear": 120
                },
                "machine_type": 3,  # H_TYPE (güç: 183400W > 9000W)
                "prediction": 1,
                "probability": 9100
            },
            {
                "name": "✅ NORMAL OPERASYON",
                "machine_id": 104,
                "sensor_data": {
                    "air_temperature": 29810,      # 298.10K
                    "process_temperature": 30860,   # 308.60K
                    "rotational_speed": 1551,
                    "torque": 4280,                 # 42.80 Nm
                    "tool_wear": 120                # Normal
                },
                "machine_type": 2,  # M_TYPE
                "prediction": 0,
                "probability": 1500
            }
        ]
        
        for i, scenario in enumerate(scenarios, 1):
            log(f"\n{Colors.CYAN}{'='*80}{Colors.RESET}")
            log(f"{Colors.BOLD}SENARYO {i}: {scenario['name']}{Colors.RESET}")
            log(f"{Colors.CYAN}{'='*80}{Colors.RESET}")
            
            try:
                # 1. Sensör verisi gönderme
                data_id, data_commitment = self.simulate_sensor_data_submission(
                    scenario["machine_id"],
                    scenario["name"], 
                    scenario["sensor_data"],
                    scenario["machine_type"]
                )
                
                # 2. Tahmin kaydetme
                prediction_id = self.simulate_prediction_storage(
                    scenario["machine_id"],
                    data_id,
                    scenario["prediction"],
                    scenario["probability"]
                )
                
                # 3. Arıza analizi
                analysis = self.analyze_failure_from_sensor_data(
                    scenario["sensor_data"],
                    scenario["machine_type"]
                )
                
                # 4. Arıza kanıtı gönderme (eğer arıza varsa)
                proof_id = None
                if analysis["failure_detected"]:
                    proof_id = self.simulate_failure_proof_submission(
                        scenario["sensor_data"],
                        scenario["machine_type"],
                        analysis
                    )
                    
                    if proof_id:
                        # 5. Manager doğrulaması
                        self.simulate_proof_verification(proof_id)
                        
                        # 6. Kanıtı ana sisteme bağlama
                        self.simulate_proof_linking(prediction_id, proof_id)
                        
                        # 7. Bakım iş akışı (eğer kritik/yüksek öncelikse)
                        if analysis["severity"] >= 3:
                            task_id = max(self.maintenance_tasks.keys()) if self.maintenance_tasks else None
                            if task_id:
                                self.simulate_maintenance_workflow(task_id)
                else:
                    log_info("Normal operasyon - Arıza kanıtı gerekmez")
                
                log_success(f"✅ Senaryo {i} başarıyla tamamlandı!")
                
            except Exception as e:
                log_error(f"❌ Senaryo {i} hatası: {e}")
        
        # 8. Sistem raporu
        self.generate_system_report()
        
        # 9. Kontrat adresleri ve deployment bilgisi
        log_step("🚀", "Production Deployment Bilgisi")
        log("   📋 Kontrat Adresleri:")
        log(f"      • UniversalFailureVerifier: {self.failure_verifier_address}")
        log(f"      • PdMSystemIntegrated: {self.pdm_system_address}")
        log("   🔧 Derleme Komutları:")
        log("      • npx hardhat compile")
        log("      • npx hardhat run scripts/deploy_integrated.js --network holesky")
        log("   📊 Entegrasyon Noktaları:")
        log("      • pdm_main.py → PdMSystemIntegrated")
        log("      • ZK Circuits → UniversalFailureVerifier")
        log("      • Maintenance Dashboard → Her iki kontrat")
        
        log(f"\n{Colors.GREEN}🎉 Integrated PDM System Demo Tamamlandı!{Colors.RESET}")
        log(f"{Colors.BOLD}Artık tam entegre, production-ready PDM sisteminiz hazır!{Colors.RESET}")

if __name__ == "__main__":
    demo = IntegratedPDMDemo()
    demo.run_comprehensive_demo() 