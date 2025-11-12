// setup_sensor_validity.js
// Sensor Validity Circuit Setup Script

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Renkli konsol çıktısı
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    red: "\x1b[31m",
    cyan: "\x1b[36m"
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function setupSensorValidityCircuit() {
    log("🔧 Sensor Validity Circuit Setup Başlıyor...", 'cyan');
    
    const circuitName = "sensor_validity";
    const circuitPath = path.join(__dirname, `${circuitName}.circom`);
    const outputDir = path.join(__dirname, `${circuitName}_js`);
    
    try {
        // 1. Circuit'in varlığını kontrol et
        if (!fs.existsSync(circuitPath)) {
            log(`❌ Circuit dosyası bulunamadı: ${circuitPath}`, 'red');
            return false;
        }
        
        log(`✅ Circuit dosyası bulundu: ${circuitName}.circom`, 'green');
        
        // 2. Output dizinini temizle/oluştur
        if (fs.existsSync(outputDir)) {
            log("🧹 Eski output dosyaları temizleniyor...", 'yellow');
            fs.rmSync(outputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(outputDir, { recursive: true });
        
        // 3. Circuit'i derle
        log("🔨 Circuit derleniyor...", 'blue');
        execSync(`circom ${circuitPath} --r1cs --wasm --sym -o ${outputDir}`, {
            stdio: 'inherit',
            cwd: __dirname
        });
        
        log("✅ Circuit başarıyla derlendi!", 'green');
        
        // 4. Trusted setup (Powers of Tau)
        log("🌟 Powers of Tau ceremony başlıyor...", 'blue');
        
        // Küçük circuit için 2^12 yeterli (4096 constraints)
        const ptauFile = path.join(outputDir, 'pot12_final.ptau');
        
        // Powers of tau download or generate
        if (!fs.existsSync(ptauFile)) {
            log("📥 Powers of Tau dosyası oluşturuluyor...", 'yellow');
            execSync(`snarkjs powersoftau new bn128 12 ${path.join(outputDir, 'pot12_0000.ptau')} -v`, {
                stdio: 'inherit',
                cwd: outputDir
            });
            
            execSync(`snarkjs powersoftau contribute ${path.join(outputDir, 'pot12_0000.ptau')} ${path.join(outputDir, 'pot12_0001.ptau')} --name="First contribution" -v`, {
                stdio: 'inherit',
                cwd: outputDir,
                input: 'some random text for entropy\n'
            });
            
            execSync(`snarkjs powersoftau prepare phase2 ${path.join(outputDir, 'pot12_0001.ptau')} ${ptauFile} -v`, {
                stdio: 'inherit',
                cwd: outputDir
            });
        }
        
        // 5. Generate zkey
        log("🔑 Circuit-specific zkey oluşturuluyor...", 'blue');
        const zkeyPath = path.join(outputDir, `${circuitName}_0000.zkey`);
        const finalZkeyPath = path.join(outputDir, `${circuitName}_final.zkey`);
        
        execSync(`snarkjs groth16 setup ${path.join(outputDir, `${circuitName}.r1cs`)} ${ptauFile} ${zkeyPath}`, {
            stdio: 'inherit',
            cwd: outputDir
        });
        
        // Circuit-specific ceremony
        execSync(`snarkjs zkey contribute ${zkeyPath} ${finalZkeyPath} --name="Second contribution" -v`, {
            stdio: 'inherit',
            cwd: outputDir,
            input: 'more random entropy for zkey\n'
        });
        
        // 6. Export verification key
        log("📋 Verification key export ediliyor...", 'blue');
        const vkeyPath = path.join(outputDir, `${circuitName}_verification_key.json`);
        execSync(`snarkjs zkey export verificationkey ${finalZkeyPath} ${vkeyPath}`, {
            stdio: 'inherit',
            cwd: outputDir
        });
        
        // 7. Generate Solidity verifier
        log("📝 Solidity verifier oluşturuluyor...", 'blue');
        const verifierPath = path.join(__dirname, '..', '..', 'contracts', 'SensorValidityVerifier.sol');
        execSync(`snarkjs zkey export solidityverifier ${finalZkeyPath} ${verifierPath}`, {
            stdio: 'inherit',
            cwd: outputDir
        });
        
        // 8. Test proof generation
        log("🧪 Test proof oluşturuluyor...", 'blue');
        
        // Sample input for TWF Rule 1 (Critical)
        const testInput = {
            tool_wear: "210",           // Critical level (>= 200)
            cutting_temperature: "85",  // Critical level (>= 80)
            torque: "55",              // Below critical but high
            vibration: "12",           // Normal
            acoustic_emission: "75",    // Normal
            spindle_speed: "2500",     // Normal
            nonce: "12345",            // Random nonce
            data_commitment: "0",       // Will be calculated
            failure_rule_id: "1",      // Test Rule 1 (Critical TWF)
            timestamp: Math.floor(Date.now() / 1000).toString()
        };
        
        // Calculate data commitment (simplified - should use Poseidon hash in real implementation)
        // For now, using a placeholder
        testInput.data_commitment = "21663839004416932945382355908790599225266501822907911457504978515578255421292";
        
        const inputPath = path.join(outputDir, 'test_input.json');
        fs.writeFileSync(inputPath, JSON.stringify(testInput, null, 2));
        
        // Generate witness
        const witnessPath = path.join(outputDir, 'witness.wtns');
        execSync(`node ${path.join(outputDir, `${circuitName}.js`)} ${inputPath} ${witnessPath}`, {
            stdio: 'inherit',
            cwd: outputDir
        });
        
        // Generate proof
        const proofPath = path.join(outputDir, 'proof.json');
        const publicPath = path.join(outputDir, 'public.json');
        execSync(`snarkjs groth16 prove ${finalZkeyPath} ${witnessPath} ${proofPath} ${publicPath}`, {
            stdio: 'inherit',
            cwd: outputDir
        });
        
        // Verify proof
        log("✅ Proof doğrulanıyor...", 'blue');
        execSync(`snarkjs groth16 verify ${vkeyPath} ${publicPath} ${proofPath}`, {
            stdio: 'inherit',
            cwd: outputDir
        });
        
        // 9. Summary
        log("\n🎉 Sensor Validity Circuit Setup Tamamlandı!", 'green');
        log("📋 Oluşturulan dosyalar:", 'cyan');
        log(`   • Circuit: ${circuitName}.circom`, 'reset');
        log(`   • WASM: ${outputDir}/${circuitName}.wasm`, 'reset');
        log(`   • R1CS: ${outputDir}/${circuitName}.r1cs`, 'reset');
        log(`   • ZKey: ${outputDir}/${circuitName}_final.zkey`, 'reset');
        log(`   • Verification Key: ${outputDir}/${circuitName}_verification_key.json`, 'reset');
        log(`   • Solidity Verifier: contracts/SensorValidityVerifier.sol`, 'reset');
        log(`   • Test Proof: ${outputDir}/proof.json`, 'reset');
        
        log("\n💡 TWF Kuralları:", 'yellow');
        log("   • Rule 1 (Kritik): tool_wear >= 200 VE (temp >= 80 VEYA torque >= 60)", 'reset');
        log("   • Rule 2 (Orta): tool_wear >= 150 VE temp >= 65 VE torque >= 45", 'reset');
        log("   • Rule 3 (Hafif): tool_wear >= 100 VE vibration >= 15", 'reset');
        
        log("\n🔗 Kullanım:", 'yellow');
        log("   • Python'da: SensorValidityVerifier contract'ını deploy edin", 'reset');
        log("   • Sensör verilerinizi bu kurallara göre doğrulayın", 'reset');
        log("   • ZK proof ile gizlilik korunarak arıza kanıtlayın", 'reset');
        
        return true;
        
    } catch (error) {
        log(`❌ Setup hatası: ${error.message}`, 'red');
        return false;
    }
}

// Script'i çalıştır
if (require.main === module) {
    setupSensorValidityCircuit().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { setupSensorValidityCircuit }; 