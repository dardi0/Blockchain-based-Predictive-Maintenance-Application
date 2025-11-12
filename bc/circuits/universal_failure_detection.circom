pragma circom 2.0.0;

// Import necessary circomlib templates
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

/**
 * @title Universal Failure Detection Circuit
 * @dev ZK circuit to prove sensor data meets ANY failure criteria
 * @notice Bu circuit, tüm arıza türlerini (TWF, HF, VWF, RF, OS) destekler
 */

template UniversalFailureDetection() {
    // --- PRIVATE INPUTS (Gizli Sensör Verileri) ---
    signal private input tool_wear;          // Takım aşınması (0-300)
    signal private input cutting_temperature; // Kesim sıcaklığı (°C)  
    signal private input torque;             // Tork değeri (Nm)
    signal private input vibration;          // Titreşim değeri (mm/s)
    signal private input acoustic_emission;  // Akustik emisyon (dB)
    signal private input spindle_speed;      // İş mili hızı (rpm)
    signal private input cutting_force;      // Kesim kuvveti (N)
    signal private input surface_roughness;  // Yüzey pürüzlülüğü (μm)
    signal private input chip_formation;     // Talaş oluşumu indeksi (0-100)
    signal private input coolant_flow;       // Soğutma akışı (L/min)
    signal private input power_consumption;  // Güç tüketimi (W)
    signal private input noise_level;        // Gürültü seviyesi (dB)
    
    // Veri bütünlüğü için nonce
    signal private input nonce;
    
    // --- PUBLIC INPUTS (Açık) ---
    signal input data_commitment;            // Sensör verisinin hash'i
    signal input failure_type;               // Arıza türü ID'si
    signal input severity_threshold;         // Minimum şiddet eşiği
    signal input timestamp;                  // Zaman damgası
    
    // --- OUTPUT ---
    signal output is_failure_detected;       // 1: Arıza tespit edildi, 0: edilmedi
    signal output severity_level;           // Arıza şiddet seviyesi (1-10)
    signal output confidence_score;         // Güven puanı (0-100)
    
    // --- COMPONENTS ---
    component hasher = Poseidon(13);        // 12 sensör + nonce
    component range_checks[12];             // Her parametre için aralık kontrolü
    
    // --- FAILURE TYPE DEFINITIONS ---
    // 1: TWF (Tool Wear Failure)
    // 2: HF (Heat Failure / Thermal)
    // 3: VWF (Vibration/Wear Failure)
    // 4: RF (Roughness Failure / Surface Quality)
    // 5: OS (Overload/Stress Failure)
    // 6: CF (Coolant Failure)
    // 7: NF (Noise Failure)
    // 8: COMBINED (Birden fazla faktör)
    
    // --- TWF (Tool Wear Failure) LOGIC ---
    signal twf_critical, twf_high, twf_medium;
    
    component twf_crit = GreaterEqThan(9);
    twf_crit.in[0] <== tool_wear;
    twf_crit.in[1] <== 200;
    twf_critical <== twf_crit.out;
    
    component twf_h = GreaterEqThan(9);
    twf_h.in[0] <== tool_wear;
    twf_h.in[1] <== 150;
    twf_high <== twf_h.out;
    
    component twf_m = GreaterEqThan(9);
    twf_m.in[0] <== tool_wear;
    twf_m.in[1] <== 100;
    twf_medium <== twf_m.out;
    
    // --- HF (Heat Failure) LOGIC ---
    signal hf_critical, hf_high, hf_medium;
    
    component hf_crit = GreaterEqThan(8);
    hf_crit.in[0] <== cutting_temperature;
    hf_crit.in[1] <== 90;
    hf_critical <== hf_crit.out;
    
    component hf_h = GreaterEqThan(8);
    hf_h.in[0] <== cutting_temperature;
    hf_h.in[1] <== 75;
    hf_high <== hf_h.out;
    
    component hf_m = GreaterEqThan(8);
    hf_m.in[0] <== cutting_temperature;
    hf_m.in[1] <== 60;
    hf_medium <== hf_m.out;
    
    // --- VWF (Vibration/Wear Failure) LOGIC ---
    signal vwf_critical, vwf_high, vwf_medium;
    
    component vwf_crit = GreaterEqThan(6);
    vwf_crit.in[0] <== vibration;
    vwf_crit.in[1] <== 20;
    vwf_critical <== vwf_crit.out;
    
    component vwf_h = GreaterEqThan(6);
    vwf_h.in[0] <== vibration;
    vwf_h.in[1] <== 15;
    vwf_high <== vwf_h.out;
    
    component vwf_m = GreaterEqThan(6);
    vwf_m.in[0] <== vibration;
    vwf_m.in[1] <== 10;
    vwf_medium <== vwf_m.out;
    
    // --- RF (Roughness Failure) LOGIC ---
    signal rf_critical, rf_high, rf_medium;
    
    component rf_crit = GreaterEqThan(6);
    rf_crit.in[0] <== surface_roughness;
    rf_crit.in[1] <== 10;
    rf_critical <== rf_crit.out;
    
    component rf_h = GreaterEqThan(6);
    rf_h.in[0] <== surface_roughness;
    rf_h.in[1] <== 7;
    rf_high <== rf_h.out;
    
    component rf_m = GreaterEqThan(6);
    rf_m.in[0] <== surface_roughness;
    rf_m.in[1] <== 4;
    rf_medium <== rf_m.out;
    
    // --- OS (Overload/Stress Failure) LOGIC ---
    signal os_critical, os_high, os_medium;
    
    // Combine torque, cutting force, and power consumption
    signal overload_index;
    overload_index <== torque + cutting_force + (power_consumption / 10);
    
    component os_crit = GreaterEqThan(12);
    os_crit.in[0] <== overload_index;
    os_crit.in[1] <== 300; // Kritik yük seviyesi
    os_critical <== os_crit.out;
    
    component os_h = GreaterEqThan(12);
    os_h.in[0] <== overload_index;
    os_h.in[1] <== 200; // Yüksek yük seviyesi
    os_high <== os_h.out;
    
    component os_m = GreaterEqThan(12);
    os_m.in[0] <== overload_index;
    os_m.in[1] <== 150; // Orta yük seviyesi
    os_medium <== os_m.out;
    
    // --- CF (Coolant Failure) LOGIC ---
    signal cf_critical, cf_high, cf_medium;
    
    component cf_crit = LessThan(6);
    cf_crit.in[0] <== coolant_flow;
    cf_crit.in[1] <== 2; // Kritik düşük akış
    cf_critical <== cf_crit.out;
    
    component cf_h = LessThan(6);
    cf_h.in[0] <== coolant_flow;
    cf_h.in[1] <== 5; // Düşük akış
    cf_high <== cf_h.out;
    
    component cf_m = LessThan(6);
    cf_m.in[0] <== coolant_flow;
    cf_m.in[1] <== 8; // Orta akış
    cf_medium <== cf_m.out;
    
    // --- NF (Noise Failure) LOGIC ---
    signal nf_critical, nf_high, nf_medium;
    
    component nf_crit = GreaterEqThan(8);
    nf_crit.in[0] <== noise_level;
    nf_crit.in[1] <== 95; // Kritik gürültü seviyesi
    nf_critical <== nf_crit.out;
    
    component nf_h = GreaterEqThan(8);
    nf_h.in[0] <== noise_level;
    nf_h.in[1] <== 85; // Yüksek gürültü
    nf_high <== nf_h.out;
    
    component nf_m = GreaterEqThan(8);
    nf_m.in[0] <== noise_level;
    nf_m.in[1] <== 75; // Orta gürültü
    nf_medium <== nf_m.out;
    
    // --- FAILURE TYPE SELECTION ---
    component failure_selectors[8];
    
    for (var i = 0; i < 8; i++) {
        failure_selectors[i] = IsEqual();
        failure_selectors[i].in[0] <== failure_type;
        failure_selectors[i].in[1] <== i + 1;
    }
    
    // --- FAILURE DETECTION LOGIC ---
    signal failure_results[8];
    
    // TWF Detection (failure_type == 1)
    signal twf_temp_or_torque;
    component twf_or = OR();
    twf_or.a <== hf_high; // temp >= 75
    twf_or.b <== (torque >= 60 ? 1 : 0); // torque >= 60 (simplified)
    twf_temp_or_torque <== twf_or.out;
    
    component twf_and = AND();
    twf_and.a <== twf_high; // tool_wear >= 150
    twf_and.b <== twf_temp_or_torque;
    failure_results[0] <== twf_and.out;
    
    // HF Detection (failure_type == 2)
    component hf_temp_power = AND();
    hf_temp_power.a <== hf_medium; // temp >= 60
    hf_temp_power.b <== (power_consumption >= 2000 ? 1 : 0); // high power
    failure_results[1] <== hf_temp_power.out;
    
    // VWF Detection (failure_type == 3)
    component vwf_vib_acoustic = AND();
    vwf_vib_acoustic.a <== vwf_medium; // vibration >= 10
    vwf_vib_acoustic.b <== (acoustic_emission >= 70 ? 1 : 0); // high acoustic
    failure_results[2] <== vwf_vib_acoustic.out;
    
    // RF Detection (failure_type == 4)
    component rf_surface_chip = AND();
    rf_surface_chip.a <== rf_medium; // surface roughness >= 4
    rf_surface_chip.b <== (chip_formation >= 70 ? 1 : 0); // poor chip formation
    failure_results[3] <== rf_surface_chip.out;
    
    // OS Detection (failure_type == 5)
    failure_results[4] <== os_medium; // overload index check
    
    // CF Detection (failure_type == 6)
    component cf_temp_flow = AND();
    cf_temp_flow.a <== cf_medium; // low coolant flow
    cf_temp_flow.b <== hf_medium; // high temperature due to poor cooling
    failure_results[5] <== cf_temp_flow.out;
    
    // NF Detection (failure_type == 7)
    component nf_noise_vib = AND();
    nf_noise_vib.a <== nf_medium; // high noise
    nf_noise_vib.b <== vwf_medium; // high vibration (correlated)
    failure_results[6] <== nf_noise_vib.out;
    
    // COMBINED Detection (failure_type == 8)
    signal combined_score;
    combined_score <== twf_medium + hf_medium + vwf_medium + rf_medium + os_medium + cf_medium + nf_medium;
    component combined_check = GreaterEqThan(4);
    combined_check.in[0] <== combined_score;
    combined_check.in[1] <== 3; // At least 3 different failure indicators
    failure_results[7] <== combined_check.out;
    
    // --- FINAL RESULT CALCULATION ---
    signal selected_results[8];
    for (var i = 0; i < 8; i++) {
        selected_results[i] <== failure_selectors[i].out * failure_results[i];
    }
    
    // Combine all selected results
    signal partial_result_1, partial_result_2, partial_result_3, partial_result_4;
    component or_gates[7];
    
    for (var i = 0; i < 7; i++) {
        or_gates[i] = OR();
    }
    
    or_gates[0].a <== selected_results[0];
    or_gates[0].b <== selected_results[1];
    partial_result_1 <== or_gates[0].out;
    
    or_gates[1].a <== partial_result_1;
    or_gates[1].b <== selected_results[2];
    partial_result_2 <== or_gates[1].out;
    
    or_gates[2].a <== partial_result_2;
    or_gates[2].b <== selected_results[3];
    partial_result_3 <== or_gates[2].out;
    
    or_gates[3].a <== partial_result_3;
    or_gates[3].b <== selected_results[4];
    partial_result_4 <== or_gates[3].out;
    
    or_gates[4].a <== partial_result_4;
    or_gates[4].b <== selected_results[5];
    signal partial_result_5;
    partial_result_5 <== or_gates[4].out;
    
    or_gates[5].a <== partial_result_5;
    or_gates[5].b <== selected_results[6];
    signal partial_result_6;
    partial_result_6 <== or_gates[5].out;
    
    or_gates[6].a <== partial_result_6;
    or_gates[6].b <== selected_results[7];
    is_failure_detected <== or_gates[6].out;
    
    // --- SEVERITY CALCULATION ---
    signal severity_points;
    severity_points <== twf_critical * 3 + twf_high * 2 + twf_medium * 1 +
                       hf_critical * 3 + hf_high * 2 + hf_medium * 1 +
                       vwf_critical * 2 + vwf_high * 1 +
                       rf_critical * 2 + rf_high * 1 +
                       os_critical * 3 + os_high * 2 + os_medium * 1 +
                       cf_critical * 2 + cf_high * 1 +
                       nf_critical * 1;
    
    // Map severity points to 1-10 scale
    component sev_mapping = LessThan(8);
    sev_mapping.in[0] <== severity_points;
    sev_mapping.in[1] <== 10;
    
    severity_level <== (severity_points > 0) ? severity_points + 1 : 1;
    
    // --- CONFIDENCE SCORE ---
    signal sensor_count;
    sensor_count <== 12; // Total number of sensors
    
    signal active_sensors;
    active_sensors <== ((tool_wear > 0) ? 1 : 0) +
                      ((cutting_temperature > 0) ? 1 : 0) +
                      ((torque > 0) ? 1 : 0) +
                      ((vibration > 0) ? 1 : 0) +
                      ((acoustic_emission > 0) ? 1 : 0) +
                      ((spindle_speed > 0) ? 1 : 0) +
                      ((cutting_force > 0) ? 1 : 0) +
                      ((surface_roughness > 0) ? 1 : 0) +
                      ((chip_formation > 0) ? 1 : 0) +
                      ((coolant_flow > 0) ? 1 : 0) +
                      ((power_consumption > 0) ? 1 : 0) +
                      ((noise_level > 0) ? 1 : 0);
    
    confidence_score <== (active_sensors * 100) / sensor_count;
    
    // --- DATA COMMITMENT VERIFICATION ---
    hasher.inputs[0] <== tool_wear;
    hasher.inputs[1] <== cutting_temperature;
    hasher.inputs[2] <== torque;
    hasher.inputs[3] <== vibration;
    hasher.inputs[4] <== acoustic_emission;
    hasher.inputs[5] <== spindle_speed;
    hasher.inputs[6] <== cutting_force;
    hasher.inputs[7] <== surface_roughness;
    hasher.inputs[8] <== chip_formation;
    hasher.inputs[9] <== coolant_flow;
    hasher.inputs[10] <== power_consumption;
    hasher.inputs[11] <== noise_level;
    hasher.inputs[12] <== nonce;
    
    hasher.out === data_commitment;
    
    // --- RANGE CHECKS ---
    // Tool wear: 0-300
    range_checks[0] = Num2Bits(9);
    range_checks[0].in <== tool_wear;
    
    // Temperature: 0-150°C
    range_checks[1] = Num2Bits(8);
    range_checks[1].in <== cutting_temperature;
    
    // Torque: 0-100 Nm
    range_checks[2] = Num2Bits(7);
    range_checks[2].in <== torque;
    
    // Vibration: 0-50 mm/s
    range_checks[3] = Num2Bits(6);
    range_checks[3].in <== vibration;
    
    // Acoustic: 0-120 dB
    range_checks[4] = Num2Bits(7);
    range_checks[4].in <== acoustic_emission;
    
    // Spindle speed: 0-10000 rpm
    range_checks[5] = Num2Bits(14);
    range_checks[5].in <== spindle_speed;
    
    // Cutting force: 0-500 N
    range_checks[6] = Num2Bits(9);
    range_checks[6].in <== cutting_force;
    
    // Surface roughness: 0-20 μm
    range_checks[7] = Num2Bits(5);
    range_checks[7].in <== surface_roughness;
    
    // Chip formation: 0-100 index
    range_checks[8] = Num2Bits(7);
    range_checks[8].in <== chip_formation;
    
    // Coolant flow: 0-30 L/min
    range_checks[9] = Num2Bits(5);
    range_checks[9].in <== coolant_flow;
    
    // Power consumption: 0-5000 W
    range_checks[10] = Num2Bits(13);
    range_checks[10].in <== power_consumption;
    
    // Noise level: 0-120 dB
    range_checks[11] = Num2Bits(7);
    range_checks[11].in <== noise_level;
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
component main = UniversalFailureDetection(); 