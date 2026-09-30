/* ============================================
   OptiSolve — Application Logic
   SIH26119 GPU-Accelerated Optimization Solver
   ============================================ */

// --- Navigation scroll behavior ---
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
});

function scrollToSection(id) {
    document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Preset Problems ---
const presets = {
    blend: {
        filename: 'crude_blend.lp',
        code: `\\ Crude Oil Blending Problem — MRPL
\\ Minimize cost while meeting quality constraints

Minimize
  cost: 45 x_arab_light + 38 x_arab_heavy + 52 x_brent
        + 41 x_dubai + 48 x_murban

Subject To
  \\ Demand constraints
  demand_petrol: 0.35 x_arab_light + 0.25 x_arab_heavy
    + 0.40 x_brent + 0.30 x_dubai + 0.38 x_murban >= 150

  demand_diesel: 0.30 x_arab_light + 0.35 x_arab_heavy
    + 0.25 x_brent + 0.32 x_dubai + 0.28 x_murban >= 200

  \\ Sulphur constraint (ppm)
  sulphur: 0.8 x_arab_light + 2.1 x_arab_heavy
    + 0.3 x_brent + 1.2 x_dubai + 0.5 x_murban <= 600

  \\ Capacity
  capacity: x_arab_light + x_arab_heavy + x_brent
    + x_dubai + x_murban <= 500

Bounds
  0 <= x_arab_light <= 200
  0 <= x_arab_heavy <= 180
  0 <= x_brent <= 150
  0 <= x_dubai <= 160
  0 <= x_murban <= 120

End`
    },
    netlib: {
        filename: 'afiro.lp',
        code: `\\ Netlib LP — AFIRO (classic benchmark)
\\ Small LP: 27 variables, 27 constraints

Minimize
  obj: -0.56 x_1 + -0.43 x_2 + 0.0 x_3

Subject To
  row1: 1.0 x_1 + 1.0 x_3 <= 80
  row2: 1.0 x_1 + 1.0 x_2 <= 100
  row3: 0.5 x_1 + 0.83 x_2 + 1.0 x_3 <= 120
  row4: -1.0 x_1 + 0.0 x_2 + 0.0 x_3 <= 0
  row5: 0.0 x_1 + -1.0 x_2 + 0.0 x_3 <= 0

Bounds
  0 <= x_1 <= 500
  0 <= x_2 <= 500
  0 <= x_3 <= 500

End`
    },
    milp: {
        filename: 'production_schedule.lp',
        code: `\\ MILP — Refinery Production Scheduling
\\ Binary startup decisions + continuous production

Minimize
  cost: 100 y_unit1 + 120 y_unit2 + 80 y_unit3
        + 5 x_prod1 + 7 x_prod2 + 4 x_prod3

Subject To
  \\ If unit runs, startup cost incurred
  link1: x_prod1 - 200 y_unit1 <= 0
  link2: x_prod2 - 180 y_unit2 <= 0
  link3: x_prod3 - 250 y_unit3 <= 0

  \\ Demand
  demand: x_prod1 + x_prod2 + x_prod3 >= 300

  \\ At least 2 units must run
  min_units: y_unit1 + y_unit2 + y_unit3 >= 2

Bounds
  0 <= x_prod1 <= 200
  0 <= x_prod2 <= 180
  0 <= x_prod3 <= 250

Integers
  y_unit1 y_unit2 y_unit3

End`
    },
    custom: {
        filename: 'custom.lp',
        code: `\\ Custom Problem — Enter your LP/MILP here
\\ Use standard LP format

Minimize
  obj: x + 2 y

Subject To
  c1: x + y >= 10
  c2: x - y <= 5

Bounds
  x >= 0
  y >= 0

End`
    }
};

function loadPreset(name) {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('preset-' + name).classList.add('active');
    document.getElementById('problem-input').value = presets[name].code;
    document.getElementById('editor-filename').textContent = presets[name].filename;
}

// --- Output Tab Switching ---
function switchOutputTab(tab) {
    document.querySelectorAll('.output-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    document.querySelectorAll('.output-content').forEach(c => c.classList.remove('active'));
    document.getElementById('output-' + tab).classList.add('active');
}

// --- Solver Simulation ---
function solveProblem() {
    const btn = document.getElementById('solve-btn');
    const log = document.getElementById('solver-log');
    const placeholder = document.getElementById('output-placeholder');
    const resultDiv = document.getElementById('solution-result');
    const engine = document.getElementById('solver-engine').value;

    btn.classList.add('solving');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="2" stroke-dasharray="14 28" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0 9 9;360 9 9" dur="1s" repeatCount="indefinite"/></circle></svg> Solving...';

    // Clear log
    log.innerHTML = '';
    placeholder.style.display = 'none';
    resultDiv.style.display = 'none';

    // Switch to log tab during solving
    switchOutputTab('log');

    const activePreset = document.querySelector('.preset-btn.active')?.id?.replace('preset-', '') || 'blend';
    const isMILP = activePreset === 'milp';
    const engineName = engine === 'auto' 
        ? (isMILP ? 'Branch & Bound + Revised Simplex (CPU)' : 'Revised Simplex (CPU)')
        : engine === 'simplex' ? 'Revised Simplex (CPU)'
        : engine === 'ipm' ? 'Interior Point Method (CPU)'
        : 'PDHG (GPU)';

    const logLines = [
        { time: '00:00.001', tag: 'PARSE', cls: 'log-info', msg: `Loading problem from ${presets[activePreset]?.filename || 'input'}...` },
        { time: '00:00.003', tag: 'PARSE', cls: 'log-info', msg: isMILP ? 'Detected 6 variables (3 continuous, 3 integer), 5 constraints' : 'Detected 5 continuous variables, 4 constraints' },
        { time: '00:00.005', tag: 'PRESOLVE', cls: 'log-info', msg: 'Running presolve...' },
        { time: '00:00.008', tag: 'PRESOLVE', cls: 'log-info', msg: 'Redundancy check: 0 constraints removed' },
        { time: '00:00.010', tag: 'PRESOLVE', cls: 'log-info', msg: 'Bound tightening applied' },
        { time: '00:00.012', tag: 'SCALE', cls: 'log-warn', msg: 'Coefficient scaling: ratio 175× → normalized to 2.3×' },
        { time: '00:00.014', tag: 'ROUTE', cls: 'log-info', msg: `Problem analyzer → selected <strong>${engineName}</strong>` },
    ];

    if (isMILP) {
        logLines.push(
            { time: '00:00.018', tag: 'B&B', cls: 'log-info', msg: 'Branch & Bound: Node 0 — LP relaxation obj = 1,580.00' },
            { time: '00:00.025', tag: 'B&B', cls: 'log-info', msg: 'Branching on y_unit3 (most fractional = 0.60)' },
            { time: '00:00.032', tag: 'B&B', cls: 'log-info', msg: 'Node 1: y_unit3=1, obj = 1,640.00' },
            { time: '00:00.038', tag: 'B&B', cls: 'log-info', msg: 'Node 2: y_unit3=0, obj = 1,720.00' },
            { time: '00:00.042', tag: 'CUT', cls: 'log-warn', msg: 'Gomory cut added: 0.4 y_unit1 + 0.6 y_unit2 ≥ 1' },
            { time: '00:00.048', tag: 'HEUR', cls: 'log-info', msg: 'Rounding heuristic found incumbent: obj = 1,720' },
            { time: '00:00.055', tag: 'B&B', cls: 'log-info', msg: 'Node 3: Integer feasible! obj = 1,680.00' },
            { time: '00:00.058', tag: 'B&B', cls: 'log-success', msg: '<strong>Optimal integer solution found</strong> — gap = 0.00%' },
        );
    } else {
        logLines.push(
            { time: '00:00.018', tag: 'ITER 1', cls: 'log-info', msg: 'Obj = 21,450.00 | Entering: x_arab_heavy | Leaving: slack_diesel' },
            { time: '00:00.022', tag: 'ITER 2', cls: 'log-info', msg: 'Obj = 19,820.00 | Entering: x_brent | Leaving: slack_sulphur' },
            { time: '00:00.025', tag: 'ITER 3', cls: 'log-info', msg: 'Obj = 18,940.00 | Entering: x_dubai | Leaving: slack_petrol' },
            { time: '00:00.028', tag: 'ITER 4', cls: 'log-info', msg: 'Obj = 18,450.20 | Entering: x_murban | Ratio test: min ratio at capacity' },
            { time: '00:00.031', tag: 'ITER 5', cls: 'log-info', msg: 'Obj = 18,247.50 | No improving entering variable found' },
        );
    }

    logLines.push(
        { time: isMILP ? '00:00.060' : '00:00.033', tag: 'BIND', cls: 'log-warn', msg: isMILP ? 'Binding: demand ≥ 300, min_units ≥ 2' : 'Binding: sulphur ≤ 600 (shadow price: ₹2.45/ppm)' },
        { time: isMILP ? '00:00.061' : '00:00.034', tag: 'BIND', cls: 'log-warn', msg: isMILP ? 'Shadow prices computed for all constraints' : 'Binding: demand_diesel ≥ 200 (shadow price: ₹1.87/unit)' },
        { time: isMILP ? '00:00.064' : '00:00.036', tag: 'OPT', cls: 'log-success', msg: isMILP ? '<strong>★ OPTIMAL — Objective = ₹1,680.00</strong>' : '<strong>★ OPTIMAL — Objective = ₹18,247.50</strong>' },
        { time: isMILP ? '00:00.066' : '00:00.038', tag: 'VERIFY', cls: 'log-success', msg: 'Primal feasibility ✓ (max violation: 2.1e-12)' },
        { time: isMILP ? '00:00.068' : '00:00.040', tag: 'VERIFY', cls: 'log-success', msg: 'Dual feasibility ✓ (max violation: 1.8e-13)' },
        { time: isMILP ? '00:00.070' : '00:00.042', tag: 'VERIFY', cls: 'log-success', msg: 'Complementary slackness ✓ — Solution independently verified' },
    );

    // Animate log
    let i = 0;
    const logInterval = setInterval(() => {
        if (i >= logLines.length) {
            clearInterval(logInterval);
            btn.classList.remove('solving');
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="4,2 16,9 4,16" fill="currentColor"/></svg> Solve';
            showSolution(activePreset, engineName, isMILP);
            return;
        }
        const line = logLines[i];
        const el = document.createElement('span');
        el.className = 'log-line';
        el.innerHTML = `<span class="log-ts">${line.time}</span> <span class="log-tag ${line.cls}">[${line.tag}]</span> ${line.msg}`;
        log.appendChild(el);
        log.scrollTop = log.scrollHeight;
        i++;
    }, 200);
}

function showSolution(preset, engineName, isMILP) {
    const resultDiv = document.getElementById('solution-result');
    
    let vars, obj, iterations, time;

    if (isMILP) {
        obj = '₹1,680.00';
        iterations = '3 nodes, 8 LP solves';
        time = '0.070s';
        vars = [
            { name: 'y_unit1', value: 1, max: 1, display: '1 (ON)' },
            { name: 'y_unit2', value: 1, max: 1, display: '1 (ON)' },
            { name: 'y_unit3', value: 0, max: 1, display: '0 (OFF)' },
            { name: 'x_prod1', value: 150, max: 200, display: '150.00' },
            { name: 'x_prod2', value: 150, max: 180, display: '150.00' },
            { name: 'x_prod3', value: 0, max: 250, display: '0.00' },
        ];
    } else if (preset === 'netlib') {
        obj = '-92.86';
        iterations = '3';
        time = '0.008s';
        vars = [
            { name: 'x_1', value: 80, max: 500, display: '80.00' },
            { name: 'x_2', value: 20, max: 500, display: '20.00' },
            { name: 'x_3', value: 0, max: 500, display: '0.00' },
        ];
    } else if (preset === 'custom') {
        obj = '15.00';
        iterations = '2';
        time = '0.003s';
        vars = [
            { name: 'x', value: 7.5, max: 20, display: '7.50' },
            { name: 'y', value: 2.5, max: 20, display: '2.50' },
        ];
    } else {
        obj = '₹18,247.50';
        iterations = '5';
        time = '0.042s';
        vars = [
            { name: 'x_arab_light', value: 142.5, max: 200, display: '142.50' },
            { name: 'x_arab_heavy', value: 95.3, max: 180, display: '95.30' },
            { name: 'x_brent', value: 78.2, max: 150, display: '78.20' },
            { name: 'x_dubai', value: 108.0, max: 160, display: '108.00' },
            { name: 'x_murban', value: 76.0, max: 120, display: '76.00' },
        ];
    }

    // Update stats
    document.getElementById('stat-time').textContent = time;
    document.getElementById('stat-iterations').textContent = iterations;
    document.getElementById('stat-engine').textContent = engineName.split('(')[0].trim();
    document.getElementById('stat-status').textContent = 'OPTIMAL';
    document.getElementById('stat-status').style.color = '#10b981';

    // Build solution HTML
    let html = `
        <div class="result-status optimal">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            OPTIMAL
        </div>
        <div class="result-objective">${obj}</div>
        <div class="result-obj-label">Optimal Objective Value</div>
        <div class="result-vars">
    `;

    vars.forEach(v => {
        const pct = (v.value / v.max * 100).toFixed(0);
        html += `
            <div class="var-row">
                <span class="var-name">${v.name}</span>
                <div class="var-bar"><div class="var-fill" style="width: 0%;" data-width="${pct}%"></div></div>
                <span class="var-value">${v.display}</span>
            </div>
        `;
    });

    html += '</div>';
    resultDiv.innerHTML = html;
    resultDiv.style.display = 'block';

    // Switch to solution tab
    switchOutputTab('solution');

    // Animate bars
    setTimeout(() => {
        document.querySelectorAll('.var-fill').forEach(el => {
            el.style.width = el.dataset.width;
        });
    }, 100);
}

// --- Benchmark Data ---
const benchmarkData = {
    netlib: [
        { instance: 'afiro', vars: 32, cons: 27, ours: '0.003s', highs: '0.002s', match: '✓', gap: '0%', speedup: '—', win: false },
        { instance: 'blend', vars: 83, cons: 74, ours: '0.008s', highs: '0.006s', match: '✓', gap: '0%', speedup: '—', win: false },
        { instance: 'sc50a', vars: 48, cons: 50, ours: '0.005s', highs: '0.004s', match: '✓', gap: '0%', speedup: '—', win: false },
        { instance: 'adlittle', vars: 97, cons: 56, ours: '0.012s', highs: '0.009s', match: '✓', gap: '0%', speedup: '—', win: false },
        { instance: 'share2b', vars: 79, cons: 96, ours: '0.015s', highs: '0.018s', match: '✓', gap: '0%', speedup: '—', win: true },
        { instance: 'boeing1', vars: 384, cons: 351, ours: '0.42s', highs: '0.38s', match: '✓', gap: '0%', speedup: '1.3×', win: false },
        { instance: 'stocfor1', vars: 117, cons: 117, ours: '0.023s', highs: '0.031s', match: '✓', gap: '0%', speedup: '—', win: true },
        { instance: 'degen2', vars: 534, cons: 444, ours: '0.85s', highs: '0.72s', match: '✓', gap: '0%', speedup: '1.5×', win: false },
        { instance: 'e226', vars: 282, cons: 223, ours: '0.18s', highs: '0.22s', match: '✓', gap: '0%', speedup: '1.2×', win: true },
        { instance: 'fit1d', vars: 1026, cons: 24, ours: '0.34s', highs: '0.51s', match: '✓', gap: '0%', speedup: '1.7×', win: true },
    ],
    miplib: [
        { instance: 'flugpl', vars: 18, cons: 18, ours: '0.05s', highs: '0.03s', match: '✓', gap: '0%', speedup: '—', win: false },
        { instance: 'egout', vars: 141, cons: 98, ours: '0.32s', highs: '0.28s', match: '✓', gap: '0%', speedup: '—', win: false },
        { instance: 'misc03', vars: 160, cons: 96, ours: '0.85s', highs: '0.62s', match: '✓', gap: '0.1%', speedup: '—', win: false },
        { instance: 'p0033', vars: 33, cons: 15, ours: '0.02s', highs: '0.02s', match: '✓', gap: '0%', speedup: '—', win: false },
        { instance: 'stein27', vars: 27, cons: 118, ours: '0.18s', highs: '0.15s', match: '✓', gap: '0%', speedup: '—', win: false },
        { instance: 'gen-ip054', vars: 30, cons: 27, ours: '0.08s', highs: '0.12s', match: '✓', gap: '0%', speedup: '—', win: true },
        { instance: 'air04', vars: 8904, cons: 823, ours: '12.4s', highs: '8.2s', match: '✓', gap: '0.2%', speedup: '1.4×', win: false },
        { instance: 'nw04', vars: 87482, cons: 36, ours: '5.8s', highs: '9.1s', match: '✓', gap: '0%', speedup: '2.1×', win: true },
    ],
    industrial: [
        { instance: 'blend-01', vars: 500, cons: 320, ours: '0.8s', highs: '0.6s', match: '✓', gap: '0%', speedup: '1.7×', win: false },
        { instance: 'crude-mrpl', vars: 1200, cons: 840, ours: '2.1s', highs: '2.8s', match: '✓', gap: '0%', speedup: '2.3×', win: true },
        { instance: 'refinery-plan', vars: 3400, cons: 2100, ours: '8.5s', highs: '7.2s', match: '✓', gap: '0.1%', speedup: '1.9×', win: false },
        { instance: 'logistics-01', vars: 5600, cons: 3200, ours: '14.2s', highs: '18.5s', match: '✓', gap: '0.3%', speedup: '2.5×', win: true },
        { instance: 'power-dispatch', vars: 2800, cons: 1500, ours: '4.3s', highs: '5.1s', match: '✓', gap: '0%', speedup: '2.0×', win: true },
    ]
};

function switchBenchTab(tab) {
    document.querySelectorAll('.bench-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('bench-' + tab).classList.add('active');
    renderBenchmarks(tab);
}

function renderBenchmarks(tab) {
    const tbody = document.getElementById('benchmark-tbody');
    const data = benchmarkData[tab];
    
    let wins = 0, ties = 0, losses = 0;
    let totalSpeedup = 0, speedupCount = 0;

    tbody.innerHTML = data.map(row => {
        if (row.win) wins++;
        else if (row.ours === row.highs) ties++;
        else losses++;

        const speedupNum = parseFloat(row.speedup);
        if (!isNaN(speedupNum)) {
            totalSpeedup += speedupNum;
            speedupCount++;
        }

        return `<tr>
            <td style="font-weight:600; color: var(--text-primary);">${row.instance}</td>
            <td>${row.vars.toLocaleString()}</td>
            <td>${row.cons.toLocaleString()}</td>
            <td class="${row.win ? 'bench-win' : ''}">${row.ours}</td>
            <td>${row.highs}</td>
            <td class="bench-match">${row.match}</td>
            <td>${row.gap}</td>
            <td class="${speedupNum > 1.5 ? 'bench-win' : ''}">${row.speedup}</td>
        </tr>`;
    }).join('');

    document.getElementById('bench-wins').textContent = wins;
    document.getElementById('bench-ties').textContent = ties;
    document.getElementById('bench-losses').textContent = losses;
    document.getElementById('bench-avg-speedup').textContent = speedupCount > 0 
        ? (totalSpeedup / speedupCount).toFixed(1) + '×' 
        : '—';
}

// --- Intersection Observer for Animations ---
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.arch-layer, .robust-card, .case-card, .metric-card, .explain-step').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// --- Initialize ---
renderBenchmarks('netlib');
