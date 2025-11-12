pragma circom 2.0.0;

// Import necessary circomlib templates
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

/**
 * @title Realistic Failure Detection Circuit (AI4I2020 Dataset)
 * @dev ZK circuit based on actual PDM system with 5 failure types and 5 sensors
 * @notice AI4I2020 veri setine dayalı gerçekçi arıza tespiti
 */

template RealisticFailureDetection() {
    // --- PRIVATE INPUTS (5 Gerçek Sensör) ---
    signal private input air_temperature;        // Hava sıcaklığı [K] (295-305)
    signal private input process_temperature;    // İşlem sıcaklığı [K] (305-315)
    signal private input rotational_speed;       // Dönme hızı [rpm] (1000-3000)
    signal private input torque;                 // Tork [Nm] (3-77)
    signal private input tool_wear;              // Takım aşınması [min] (0-300)
    
    // Veri bütünlüğü için nonce
    signal private input nonce;
    
    // --- PUBLIC INPUTS (Açık) ---
    signal input data_commitment;                // Sensör verisinin hash'i
    signal input failure_type;                   // Arıza türü ID'si (1-5)
    signal input machine_type;                   // Makine tipi (1=L, 2=M, 3=H)
    signal input timestamp;                      // Zaman damgası
    
    // --- OUTPUT ---
    signal output is_failure_detected;           // 1: Arıza tespit edildi, 0: edilmedi
    signal output severity_level;               // Arıza şiddet seviyesi (1-10)
    signal output confidence_score;             // Güven puanı (0-100)
    
    // --- COMPONENTS ---
    component hasher = Poseidon(6);             // 5 sensör + nonce
    component range_checks[5];                  // Her sensör için aralık kontrolü
    
    // --- FAILURE TYPE DEFINITIONS (AI4I2020) ---
    // 1: TWF (Tool Wear Failure) - Takım aşınması
    // 2: HDF (Heat Dissipation Failure) - Isı dağılımı arızası
    // 3: PWF (Power Failure) - Güç arızası
    // 4: OSF (Overstrain Failure) - Aşırı yük arızası
    // 5: RNF (Random Failure) - Rastgele arıza
    
    // --- DERIVED CALCULATIONS ---
    signal temp_difference;                     // İşlem - Hava sıcaklığı farkı
    signal power_estimate;                      // Tahmini güç (torque * speed)
    signal overstrain_product;                  // Aşırı yük göstergesi (torque * tool_wear)
    
    temp_difference <== process_temperature - air_temperature;
    power_estimate <== torque * rotational_speed;
    overstrain_product <== torque * tool_wear;
    
    // --- TWF (Tool Wear Failure) LOGIC ---
    signal twf_critical, twf_warning;
    
    component twf_crit = GreaterEqThan(9);
    twf_crit.in[0] <== tool_wear;
    twf_crit.in[1] <== 200;  // 200+ dakika kesin arıza
    twf_critical <== twf_crit.out;
    
    component twf_warn = GreaterEqThan(9);
    twf_warn.in[0] <== tool_wear;
    twf_warn.in[1] <== 180;  // 180+ dakika uyarı seviyesi
    twf_warning <== twf_warn.out;
    
    // --- HDF (Heat Dissipation Failure) LOGIC ---
    signal hdf_temp_low, hdf_speed_low, hdf_failure;
    
    component hdf_temp = LessThan(8);
    hdf_temp.in[0] <== temp_difference;
    hdf_temp.in[1] <== 9;  // Sıcaklık farkı <8.6K kritik
    hdf_temp_low <== hdf_temp.out;
    
    component hdf_speed = LessThan(12);
    hdf_speed.in[0] <== rotational_speed;
    hdf_speed.in[1] <== 1380;  // Düşük hız kritik
    hdf_speed_low <== hdf_speed.out;
    
    component hdf_and = AND();
    hdf_and.a <== hdf_temp_low;
    hdf_and.b <== hdf_speed_low;
    hdf_failure <== hdf_and.out;
    
    // --- PWF (Power Failure) LOGIC ---
    signal pwf_low, pwf_high, pwf_failure;
    
    component pwf_l = LessThan(12);
    pwf_l.in[0] <== power_estimate;
    pwf_l.in[1] <== 3500;  // Çok düşük güç
    pwf_low <== pwf_l.out;
    
    component pwf_h = GreaterThan(13);
    pwf_h.in[0] <== power_estimate;
    pwf_h.in[1] <== 9000;  // Çok yüksek güç
    pwf_high <== pwf_h.out;
    
    component pwf_or = OR();
    pwf_or.a <== pwf_low;
    pwf_or.b <== pwf_high;
    pwf_failure <== pwf_or.out;
    
    // --- OSF (Overstrain Failure) LOGIC ---
    signal osf_limit, osf_failure;
    
    // Makine tipine göre limit belirleme
    signal type_l_active, type_m_active, type_h_active;
    
    component type_l_check = IsEqual();
    type_l_check.in[0] <== machine_type;
    type_l_check.in[1] <== 1;  // L type
    type_l_active <== type_l_check.out;
    
    component type_m_check = IsEqual();
    type_m_check.in[0] <== machine_type;
    type_m_check.in[1] <== 2;  // M type
    type_m_active <== type_m_check.out;
    
    component type_h_check = IsEqual();
    type_h_check.in[0] <== machine_type;
    type_h_check.in[1] <== 3;  // H type
    type_h_active <== type_h_check.out;
    
    // Tip bazlı limitler (11000=L, 12000=M, 13000=H)
    osf_limit <== type_l_active * 11000 + type_m_active * 12000 + type_h_active * 13000;
    
    component osf_check = GreaterThan(16);
    osf_check.in[0] <== overstrain_product;
    osf_check.in[1] <== osf_limit;
    osf_failure <== osf_check.out;
    
    // --- RNF (Random Failure) LOGIC ---
    // Kombinasyon faktörleri için karmaşık kontrol
    signal rnf_air_high, rnf_process_high, rnf_combined;
    
    component rnf_air = GreaterThan(9);
    rnf_air.in[0] <== air_temperature;
    rnf_air.in[1] <== 302;  // Yüksek hava sıcaklığı
    rnf_air_high <== rnf_air.out;
    
    component rnf_proc = GreaterThan(9);
    rnf_proc.in[0] <== process_temperature;
    rnf_proc.in[1] <== 312;  // Yüksek işlem sıcaklığı
    rnf_proc_high <== rnf_proc.out;
    
    // Random failure: Yüksek sıcaklık + düşük hız + yüksek tork kombinasyonu
    signal rnf_speed_low, rnf_torque_high, rnf_temp_combo;
    
    component rnf_speed = LessThan(12);
    rnf_speed.in[0] <== rotational_speed;
    rnf_speed.in[1] <== 1200;
    rnf_speed_low <== rnf_speed.out;
    
    component rnf_torque = GreaterThan(7);
    rnf_torque.in[0] <== torque;
    rnf_torque.in[1] <== 60;
    rnf_torque_high <== rnf_torque.out;
    
    component rnf_temp_and = AND();
    rnf_temp_and.a <== rnf_air_high;
    rnf_temp_and.b <== rnf_process_high;
    rnf_temp_combo <== rnf_temp_and.out;
    
    signal rnf_mechanical_combo;
    component rnf_mech_and = AND();
    rnf_mech_and.a <== rnf_speed_low;
    rnf_mech_and.b <== rnf_torque_high;
    rnf_mechanical_combo <== rnf_mech_and.out;
    
    component rnf_final_and = AND();
    rnf_final_and.a <== rnf_temp_combo;
    rnf_final_and.b <== rnf_mechanical_combo;
    rnf_combined <== rnf_final_and.out;
    
    // --- FAILURE TYPE SELECTION ---
    component failure_selectors[5];
    
    for (var i = 0; i < 5; i++) {
        failure_selectors[i] = IsEqual();
        failure_selectors[i].in[0] <== failure_type;
        failure_selectors[i].in[1] <== i + 1;
    }
    
    // --- FAILURE DETECTION LOGIC ---
    signal failure_results[5];
    
    // TWF Detection (failure_type == 1)
    failure_results[0] <== twf_critical;
    
    // HDF Detection (failure_type == 2)
    failure_results[1] <== hdf_failure;
    
    // PWF Detection (failure_type == 3)
    failure_results[2] <== pwf_failure;
    
    // OSF Detection (failure_type == 4)
    failure_results[3] <== osf_failure;
    
    // RNF Detection (failure_type == 5)
    failure_results[4] <== rnf_combined;
    
    // --- FINAL RESULT CALCULATION ---
    signal selected_results[5];
    for (var i = 0; i < 5; i++) {
        selected_results[i] <== failure_selectors[i].out * failure_results[i];
    }
    
    // Combine all selected results
    signal partial_result_1, partial_result_2, partial_result_3, partial_result_4;
    component or_gates[4];
    
    for (var i = 0; i < 4; i++) {
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
    is_failure_detected <== or_gates[3].out;
    
    // --- SEVERITY CALCULATION ---
    signal severity_points;
    
    // Her arıza türü için ağırlıklandırılmış puanlama
    severity_points <== twf_critical * 4 + twf_warning * 2 +  // TWF en kritik
                       hdf_failure * 3 +                      // HDF çok kritik
                       pwf_failure * 3 +                      // PWF çok kritik
                       osf_failure * 4 +                      // OSF en kritik
                       rnf_combined * 2;                      // RNF orta kritik
    
    // 1-10 arası severity seviyesi
    component sev_check1 = GreaterEqThan(4);
    sev_check1.in[0] <== severity_points;
    sev_check1.in[1] <== 6;
    signal is_very_critical;
    is_very_critical <== sev_check1.out;
    
    component sev_check2 = GreaterEqThan(4);
    sev_check2.in[0] <== severity_points;
    sev_check2.in[1] <== 3;
    signal is_critical;
    is_critical <== sev_check2.out;
    
    severity_level <== is_very_critical * 8 + 
                      (is_critical * (1 - is_very_critical)) * 5 + 
                      ((severity_points > 0 ? 1 : 0) * (1 - is_critical)) * 3 + 
                      ((severity_points == 0 ? 1 : 0)) * 1;
    
    // --- CONFIDENCE SCORE ---
    signal sensor_quality_score;
    
    // Sensör değerlerinin beklenen aralıklarda olması güveni artırır
    signal air_temp_ok, proc_temp_ok, speed_ok, torque_ok, wear_ok;
    
    component air_range = AND();
    component air_min = GreaterEqThan(9);
    air_min.in[0] <== air_temperature;
    air_min.in[1] <== 295;
    component air_max = LessEqThan(9);
    air_max.in[0] <== air_temperature;
    air_max.in[1] <== 305;
    air_range.a <== air_min.out;
    air_range.b <== air_max.out;
    air_temp_ok <== air_range.out;
    
    component proc_range = AND();
    component proc_min = GreaterEqThan(9);
    proc_min.in[0] <== process_temperature;
    proc_min.in[1] <== 305;
    component proc_max = LessEqThan(9);
    proc_max.in[0] <== process_temperature;
    proc_max.in[1] <== 315;
    proc_range.a <== proc_min.out;
    proc_range.b <== proc_max.out;
    proc_temp_ok <== proc_range.out;
    
    component speed_range = AND();
    component speed_min = GreaterEqThan(12);
    speed_min.in[0] <== rotational_speed;
    speed_min.in[1] <== 1000;
    component speed_max = LessEqThan(12);
    speed_max.in[0] <== rotational_speed;
    speed_max.in[1] <== 3000;
    speed_range.a <== speed_min.out;
    speed_range.b <== speed_max.out;
    speed_ok <== speed_range.out;
    
    component torque_range = AND();
    component torque_min = GreaterEqThan(7);
    torque_min.in[0] <== torque;
    torque_min.in[1] <== 3;
    component torque_max = LessEqThan(7);
    torque_max.in[0] <== torque;
    torque_max.in[1] <== 77;
    torque_range.a <== torque_min.out;
    torque_range.b <== torque_max.out;
    torque_ok <== torque_range.out;
    
    component wear_range = AND();
    component wear_min = GreaterEqThan(9);
    wear_min.in[0] <== tool_wear;
    wear_min.in[1] <== 0;
    component wear_max = LessEqThan(9);
    wear_max.in[0] <== tool_wear;
    wear_max.in[1] <== 300;
    wear_range.a <== wear_min.out;
    wear_range.b <== wear_max.out;
    wear_ok <== wear_range.out;
    
    sensor_quality_score <== air_temp_ok + proc_temp_ok + speed_ok + torque_ok + wear_ok;
    
    // %80 base confidence + %4 per valid sensor
    confidence_score <== 80 + (sensor_quality_score * 4);
    
    // --- DATA COMMITMENT VERIFICATION ---
    hasher.inputs[0] <== air_temperature;
    hasher.inputs[1] <== process_temperature;
    hasher.inputs[2] <== rotational_speed;
    hasher.inputs[3] <== torque;
    hasher.inputs[4] <== tool_wear;
    hasher.inputs[5] <== nonce;
    
    hasher.out === data_commitment;
    
    // --- RANGE CHECKS ---
    // Air temperature: 295-305K (8 bits yeterli)
    range_checks[0] = Num2Bits(9);
    range_checks[0].in <== air_temperature;
    
    // Process temperature: 305-315K (8 bits yeterli)
    range_checks[1] = Num2Bits(9);
    range_checks[1].in <== process_temperature;
    
    // Rotational speed: 1000-3000 rpm (12 bits)
    range_checks[2] = Num2Bits(12);
    range_checks[2].in <== rotational_speed;
    
    // Torque: 3-77 Nm (7 bits yeterli)
    range_checks[3] = Num2Bits(7);
    range_checks[3].in <== torque;
    
    // Tool wear: 0-300 min (9 bits)
    range_checks[4] = Num2Bits(9);
    range_checks[4].in <== tool_wear;
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
component main = RealisticFailureDetection(); 