pragma circom 2.0.0;

// Import necessary circomlib templates
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

/**
 * @title Sensor Validity Circuit
 * @dev ZK circuit to prove sensor data meets TWF (Tool Wear Failure) criteria
 * @notice This circuit validates that sensor readings satisfy specific failure conditions
 *         without revealing the actual sensor values
 */

template SensorValidityCheck() {
    // --- PRIVATE INPUTS (Gizli) ---
    signal private input tool_wear;          // Takım aşınması değeri (0-300)
    signal private input cutting_temperature; // Kesim sıcaklığı (°C)
    signal private input torque;             // Tork değeri (Nm)
    signal private input vibration;          // Titreşim değeri (mm/s)
    signal private input acoustic_emission;  // Akustik emisyon (dB)
    signal private input spindle_speed;      // İş mili hızı (rpm)
    
    // Veri bütünlüğü için nonce (rastgele değer)
    signal private input nonce;
    
    // --- PUBLIC INPUTS (Açık) ---
    signal input data_commitment;            // Sensör verisinin hash'i
    signal input failure_rule_id;           // Hangi arıza kuralının test edildiği
    signal input timestamp;                  // Zaman damgası
    
    // --- OUTPUT ---
    signal output is_valid;                  // 1: TWF kriterleri sağlanıyor, 0: sağlanmıyor
    signal output severity_level;           // Arıza şiddet seviyesi (1-5)
    
    // --- COMPONENTS ---
    component hasher = Poseidon(7);         // Veri taahhüdü için hash
    component range_check[6];               // Her parametre için aralık kontrolü
    
    // --- TWF FAILURE CRITERIA ---
    
    // 1. Tool Wear Kriterleri
    // Kritik: tool_wear >= 200
    // Yüksek Risk: tool_wear >= 150
    // Orta Risk: tool_wear >= 100
    signal tool_wear_critical;
    signal tool_wear_high;
    signal tool_wear_medium;
    
    component tw_critical = GreaterEqThan(8);
    tw_critical.in[0] <== tool_wear;
    tw_critical.in[1] <== 200;
    tool_wear_critical <== tw_critical.out;
    
    component tw_high = GreaterEqThan(8);
    tw_high.in[0] <== tool_wear;
    tw_high.in[1] <== 150;
    tool_wear_high <== tw_high.out;
    
    component tw_medium = GreaterEqThan(8);
    tw_medium.in[0] <== tool_wear;
    tw_medium.in[1] <== 100;
    tool_wear_medium <== tw_medium.out;
    
    // 2. Sıcaklık Kriterleri
    // Kritik: temperature >= 80°C
    // Yüksek: temperature >= 65°C
    signal temp_critical;
    signal temp_high;
    
    component temp_crit = GreaterEqThan(8);
    temp_crit.in[0] <== cutting_temperature;
    temp_crit.in[1] <== 80;
    temp_critical <== temp_crit.out;
    
    component temp_h = GreaterEqThan(8);
    temp_h.in[0] <== cutting_temperature;
    temp_h.in[1] <== 65;
    temp_high <== temp_h.out;
    
    // 3. Tork Kriterleri
    // Kritik: torque >= 60 Nm
    // Yüksek: torque >= 45 Nm
    signal torque_critical;
    signal torque_high;
    
    component torque_crit = GreaterEqThan(8);
    torque_crit.in[0] <== torque;
    torque_crit.in[1] <== 60;
    torque_critical <== torque_crit.out;
    
    component torque_h = GreaterEqThan(8);
    torque_h.in[0] <== torque;
    torque_h.in[1] <== 45;
    torque_high <== torque_h.out;
    
    // 4. Titreşim Kriterleri
    // Kritik: vibration >= 15 mm/s
    signal vibration_critical;
    
    component vib_crit = GreaterEqThan(8);
    vib_crit.in[0] <== vibration;
    vib_crit.in[1] <== 15;
    vibration_critical <== vib_crit.out;
    
    // --- RANGE CHECKS (Veri Doğrulama) ---
    // Her sensör parametresinin geçerli aralıkta olduğunu kontrol et
    
    // Tool wear: 0-300
    range_check[0] = Num2Bits(9); // 2^9 = 512 > 300
    range_check[0].in <== tool_wear;
    component tw_max = LessThan(9);
    tw_max.in[0] <== tool_wear;
    tw_max.in[1] <== 301;
    tw_max.out === 1;
    
    // Temperature: 0-120°C
    range_check[1] = Num2Bits(7); // 2^7 = 128 > 120
    range_check[1].in <== cutting_temperature;
    component temp_max = LessThan(7);
    temp_max.in[0] <== cutting_temperature;
    temp_max.in[1] <== 121;
    temp_max.out === 1;
    
    // Torque: 0-100 Nm
    range_check[2] = Num2Bits(7);
    range_check[2].in <== torque;
    component torque_max = LessThan(7);
    torque_max.in[0] <== torque;
    torque_max.in[1] <== 101;
    torque_max.out === 1;
    
    // Vibration: 0-30 mm/s
    range_check[3] = Num2Bits(5); // 2^5 = 32 > 30
    range_check[3].in <== vibration;
    component vib_max = LessThan(5);
    vib_max.in[0] <== vibration;
    vib_max.in[1] <== 31;
    vib_max.out === 1;
    
    // Acoustic emission: 0-100 dB
    range_check[4] = Num2Bits(7);
    range_check[4].in <== acoustic_emission;
    component ae_max = LessThan(7);
    ae_max.in[0] <== acoustic_emission;
    ae_max.in[1] <== 101;
    ae_max.out === 1;
    
    // Spindle speed: 100-8000 rpm
    range_check[5] = Num2Bits(13); // 2^13 = 8192 > 8000
    range_check[5].in <== spindle_speed;
    component speed_min = GreaterEqThan(13);
    speed_min.in[0] <== spindle_speed;
    speed_min.in[1] <== 100;
    speed_min.out === 1;
    component speed_max = LessThan(13);
    speed_max.in[0] <== spindle_speed;
    speed_max.in[1] <== 8001;
    speed_max.out === 1;
    
    // --- DATA COMMITMENT VERIFICATION ---
    // Gizli verilerin hash'inin, public commitment'la eşleştiğini doğrula
    hasher.inputs[0] <== tool_wear;
    hasher.inputs[1] <== cutting_temperature;
    hasher.inputs[2] <== torque;
    hasher.inputs[3] <== vibration;
    hasher.inputs[4] <== acoustic_emission;
    hasher.inputs[5] <== spindle_speed;
    hasher.inputs[6] <== nonce;
    
    hasher.out === data_commitment;
    
    // --- TWF RULE LOGIC ---
    // failure_rule_id'ye göre farklı TWF kurallarını test et
    
    signal rule_1_result; // Kritik TWF: tool_wear >= 200 VE (temp >= 80 VEYA torque >= 60)
    signal rule_2_result; // Orta TWF: tool_wear >= 150 VE temp >= 65 VE torque >= 45
    signal rule_3_result; // Hafif TWF: tool_wear >= 100 VE vibration >= 15
    
    // Rule 1: Kritik TWF
    signal temp_or_torque_critical;
    component or_gate_1 = OR();
    or_gate_1.a <== temp_critical;
    or_gate_1.b <== torque_critical;
    temp_or_torque_critical <== or_gate_1.out;
    
    component and_gate_1 = AND();
    and_gate_1.a <== tool_wear_critical;
    and_gate_1.b <== temp_or_torque_critical;
    rule_1_result <== and_gate_1.out;
    
    // Rule 2: Orta TWF
    signal temp_and_torque_high;
    component and_gate_2a = AND();
    and_gate_2a.a <== temp_high;
    and_gate_2a.b <== torque_high;
    temp_and_torque_high <== and_gate_2a.out;
    
    component and_gate_2b = AND();
    and_gate_2b.a <== tool_wear_high;
    and_gate_2b.b <== temp_and_torque_high;
    rule_2_result <== and_gate_2b.out;
    
    // Rule 3: Hafif TWF
    component and_gate_3 = AND();
    and_gate_3.a <== tool_wear_medium;
    and_gate_3.b <== vibration_critical;
    rule_3_result <== and_gate_3.out;
    
    // --- RULE SELECTION ---
    // failure_rule_id'ye göre hangi kuralın test edileceğini seç
    
    component rule_selector_1 = IsEqual();
    rule_selector_1.in[0] <== failure_rule_id;
    rule_selector_1.in[1] <== 1;
    
    component rule_selector_2 = IsEqual();
    rule_selector_2.in[0] <== failure_rule_id;
    rule_selector_2.in[1] <== 2;
    
    component rule_selector_3 = IsEqual();
    rule_selector_3.in[0] <== failure_rule_id;
    rule_selector_3.in[1] <== 3;
    
    // Final validation result
    signal rule_1_selected;
    signal rule_2_selected;
    signal rule_3_selected;
    
    rule_1_selected <== rule_selector_1.out * rule_1_result;
    rule_2_selected <== rule_selector_2.out * rule_2_result;
    rule_3_selected <== rule_selector_3.out * rule_3_result;
    
    // ANY rule'un geçmesi yeterli
    signal partial_result;
    component or_gate_final_1 = OR();
    or_gate_final_1.a <== rule_1_selected;
    or_gate_final_1.b <== rule_2_selected;
    partial_result <== or_gate_final_1.out;
    
    component or_gate_final_2 = OR();
    or_gate_final_2.a <== partial_result;
    or_gate_final_2.b <== rule_3_selected;
    is_valid <== or_gate_final_2.out;
    
    // --- SEVERITY LEVEL CALCULATION ---
    // Arıza şiddet seviyesini hesapla (1-5)
    signal severity_points;
    severity_points <== tool_wear_critical * 2 + 
                       tool_wear_high * 1 + 
                       temp_critical * 2 + 
                       temp_high * 1 + 
                       torque_critical * 1 + 
                       vibration_critical * 1;
    
    // Severity mapping: 0-1: Level 1, 2-3: Level 2, 4-5: Level 3, 6+: Level 4-5
    component sev_calc = LessThan(4);
    sev_calc.in[0] <== severity_points;
    sev_calc.in[1] <== 6;
    
    severity_level <== severity_points + 1; // Minimum level 1
}

// Helper templates
template AND() {
    signal input a;
    signal input b;
    signal output out;
    
    out <== a * b;
}

template OR() {
    signal input a;
    signal input b;
    signal output out;
    
    out <== a + b - a * b;
}

// Main component
component main = SensorValidityCheck(); 