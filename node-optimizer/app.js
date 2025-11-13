// Node Optimizer - visualization logic
(function(){
  // helpers
  const $ = id => document.getElementById(id);

  // DOM refs
  const executorCores = $('executorCores');
  const executorMemoryGb = $('executorMemoryGb');
  const executorOverheadFactor = $('executorOverheadFactor');
  const maxExecutors = $('maxExecutors');
  const targetMaxNodes = $('targetMaxNodes');
  const nodeVcpus = $('nodeVcpus');
  const nodeMemoryGb = $('nodeMemoryGb');
  const summary = $('summary');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  // Layout / visual constants (tweakable)
  const PAD = 20; // general padding between elements
  const CORE_SIZE = 20; // px per core cube
  const CORE_SPACE = 40; // vertical spacing between stacked core icons
  const NODE_WIDTH = 220; // fixed node width to avoid zooming on resize
  const NODE_GAP = 20; // gap between nodes horizontally and vertically
  const EXECUTOR_HEADER_SPACE = 40; // header area inside executor
  const EXECUTOR_FOOTER_SPACE = 10; // header area inside executor
  const NODE_HEADER_SPACE = 30; // header area for node label
  const NODE_FOOTER_SPACE = 30; // header area for node label
  const EXECUTOR_H_PADDING = 10; // left/right padding inside executor

  // bevel/shadow constants (adjustable via UI later if desired)
  const INSET_SIZE = 4;
  const SHADOW_BLUR = 0;
  const SHADOW_OFFSET = 3;
  // number of AM executors reserved cluster-wide
  const AM_EXECUTORS = 1;

  // color helpers
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function hexToRgb(hex){ const c = hex.replace('#',''); const bigint = parseInt(c,16); return {r:(bigint>>16)&255,g:(bigint>>8)&255,b:bigint&255}; }
  function rgbToHex(r,g,b){ return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }
  function lighten(hex, amount){ const c=hexToRgb(hex); const r=clamp(Math.round(c.r + 255*amount),0,255); const g=clamp(Math.round(c.g + 255*amount),0,255); const b=clamp(Math.round(c.b + 255*amount),0,255); return rgbToHex(r,g,b); }
  function darken(hex, amount){ const c=hexToRgb(hex); const r=clamp(Math.round(c.r - 255*amount),0,255); const g=clamp(Math.round(c.g - 255*amount),0,255); const b=clamp(Math.round(c.b - 255*amount),0,255); return rgbToHex(r,g,b); }

  // compute how many executors fit per node and nodes needed
  function computeDistribution(params){
    // simple model: slotsPerNode = floor(nodeVcpus / executorCores) also consider memory
    const coresPerExec = Math.max(1, Math.floor(params.executorCores));
    // account for executor memory overhead factor (e.g. 0.20 for 20%)
    const overheadFct = Math.max(0.0, Number(params.executorOverheadFactor) || 0.0);
    const memPerExec = Math.max(0.001, params.executorMemoryGb * (1.0 + overheadFct));
    const coresPerNode = Math.max(1, Math.floor(params.nodeVcpus));
    const memPerNode = Math.max(1, params.nodeMemoryGb);

    // number of executors that would fit by CPU alone
    let slotsByCores = Math.floor(coresPerNode / coresPerExec);
    // number of executors that fit by memory if configured executor memory (with overhead) is used
    const slotsByMem = Math.floor(memPerNode / memPerExec);

    // If the user-selected executor memory (including overhead) is larger than the
    // fair share when using the cores-based slot count, reduce the cores-based
    // count until the configured executor memory fits into node memory.
    // This enforces: if configured executor memory is too large, we place fewer
    // executors per node (even if CPU would allow more).
    if (slotsByCores > 0) {
      const configuredExecWithOverhead = memPerExec; // already includes overhead
      while (slotsByCores > 0) {
        const perExecRaw = Math.floor(memPerNode / slotsByCores); // GB available per executor before overhead
        // if the node can't even give 1GB per exec, break to avoid infinite loop
        if (perExecRaw <= 0) { slotsByCores = 0; break; }
        // allowed configured exec size after removing overhead (rough check)
        const allowedAfterOverheadFct = Math.floor(perExecRaw * (1.0 - overheadFct));
        // if the configured executor memory (without stripping overheadFct) is <= allowedAfterOverheadFct,
        // then the configured executor will fit when overhead is applied
        if (Math.floor(params.executorMemoryGb) <= allowedAfterOverheadFct) break;
        // otherwise reduce the cores-based slot count and retry
        slotsByCores--;
      }
    }

    const slotsPerNode = Math.max(0, Math.min(slotsByCores, slotsByMem));

    // Account for reserved AM executors cluster-wide
    const amCount = AM_EXECUTORS;
    const userRequested = Math.max(0, Number(params.maxExecutors) || 0);
    const totalToPlace = userRequested + amCount;

    let nodesNeeded = 0;
    let perNode = [];

    if (slotsPerNode === 0){
        // decide if this column is the AM slot(s) (placed on first node's first columns)
        const isAmHere = distribution.amPlaced && (idx === distribution.amNodeIndex) && (colIdx < AM_EXECUTORS);
      // perNode stays empty
    } else {
      nodesNeeded = Math.ceil(totalToPlace / slotsPerNode);
      let remaining = totalToPlace;
      for(let i=0;i<nodesNeeded;i++){
        const take = Math.min(slotsPerNode, remaining);
        perNode.push(take);
        remaining -= take;
      }
    }

    // Determine AM placement: AM executors occupy the first slots in node 0 (if any)
    let amPlaced = false;
    let amNodeIndex = -1;
    if(perNode.length > 0){
      // find node that gets the AM (first node with at least 1 slot filled)
      let cum = 0;
      for(let i=0;i<perNode.length;i++){
        if(perNode[i] > 0){ amPlaced = true; amNodeIndex = i; break; }
        cum += perNode[i];
      }
    }

    // Calculate how many user executors were actually placed (total placed minus AM if placed)
    const placedTotal = (perNode || []).reduce((a,b)=>a+b,0);
    const placedUser = Math.max(0, placedTotal - (amPlaced ? amCount : 0));
    const unplacedUser = Math.max(0, userRequested - placedUser);

    return { slotsPerNode, nodesNeeded, perNode, unplaced: unplacedUser, amPlaced, amNodeIndex };
  }

  // draw a beveled rectangle (outset/inset)
  function drawBeveledRect(ctx, x, y, w, h, opts){
    opts = opts || {};
    const filled = !!opts.filled;
    const style = opts.style || 'outset';
    const base = opts.color || (filled ? '#dfeeff' : '#ffffff');

    ctx.save();
    if(style === 'outset'){
      ctx.shadowColor = 'rgba(4,20,40,0.12)'; ctx.shadowBlur = SHADOW_BLUR; ctx.shadowOffsetX = SHADOW_OFFSET; ctx.shadowOffsetY = SHADOW_OFFSET;
      const grad = ctx.createLinearGradient(x,y,x+w,y+h);
      grad.addColorStop(0, lighten(base, 0.08)); grad.addColorStop(1, darken(base, 0.06));
      ctx.fillStyle = grad; ctx.fillRect(x,y,w,h);
      ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.lineWidth = 1; ctx.strokeStyle = darken(base,0.2); ctx.strokeRect(x+0.5,y+0.5,w-1,h-1);
    } else {
      const grad2 = ctx.createLinearGradient(x,y,x+w,y+h);
      grad2.addColorStop(0, darken(base, 0.03)); grad2.addColorStop(1, darken(base, 0.12));
      ctx.fillStyle = grad2; ctx.fillRect(x,y,w,h);
      ctx.lineWidth = 1; ctx.strokeStyle = darken(base,0.3); ctx.strokeRect(x+0.5,y+0.5,w-1,h-1);
      // inner bevel
      const d = Math.max(1, INSET_SIZE);
      ctx.beginPath(); ctx.strokeStyle='rgba(0,0,0,0.12)'; ctx.moveTo(x+1.5,y+1.5); ctx.lineTo(x + w - (d + 1), y+1.5); ctx.stroke();
    }
    ctx.restore();
  }

  // draw single vCPU icon (10x10) — draws a small cube-like square
  function drawVcpu(ctx, x, y, used=true){
    const s = CORE_SIZE;
    ctx.save();
    // base
    ctx.fillStyle = '#e6f0ff';
    if (!used) ctx.fillStyle = '#e2e2e2ff';
    ctx.fillRect(x, y, s, s);
    // border
    ctx.strokeStyle = '#0b6cff';
    if (!used) ctx.strokeStyle = '#686868ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x+0.5, y+0.5, s-1, s-1);
    // inner lines to hint a chip
    ctx.fillStyle = '#0b6cff';
    if (!used) ctx.fillStyle = '#686868ff';
    ctx.fillRect(x+2, y+2, s-4, 2);
    ctx.fillRect(x+2, y+s-4, s-4, 2);
    ctx.restore();
  }

  // main draw function — renders nodes using a precomputed layout
  function draw(distribution, layout){
    // clear
    ctx.clearRect(0,0,canvas.width,canvas.height);

    if(distribution.slotsPerNode===0){
      ctx.fillStyle='#b23';
      ctx.font='18px Segoe UI';
      ctx.fillText('No executors fit in a node with given parameters.', PAD, 60);
      return;
    }

  const nodes = distribution.perNode.length || distribution.nodesNeeded;
  const nodeCores = Math.max(1, Math.floor(Number(nodeVcpus.value) || 1));
    const nodeW = layout.nodeW;
    const columns = layout.columns;
    const rows = layout.rows;
    const nodeHeight = layout.nodeHeight;
    const offsetX = layout.offsetX;
    const execWidth = layout.execWidth;
    const spacingX = layout.spacingX;

    ctx.font = '12px Segoe UI';

    for(let idx=0; idx<nodes; idx++){
      const per = distribution.perNode[idx] || 0;
      const col = idx % columns;
      const row = Math.floor(idx / columns);
      const x = offsetX + col * (nodeW + NODE_GAP);
      const y = PAD + row * (nodeHeight + NODE_GAP);

  // draw node box
  drawBeveledRect(ctx, x, y, nodeW, nodeHeight, {filled:false, style:'inset', color:'#ffffff'});
  // compute per-node unused vCPUs
  const usedCores = per * Math.max(1, Number(executorCores.value));
  const unusedPerNode = Math.max(0, nodeCores - usedCores);
  ctx.fillStyle = '#083049'; ctx.font='12px Segoe UI';
  ctx.fillText('Node ' + (idx+1) + (unusedPerNode > 0 ? ' — ' + unusedPerNode + ' unused vCPUs' : ''), x + 12, y + 14);

  // compute starting X using PAD so side padding stays constant
  // (avoids shifting executors inward as counts change)
  // always use colsPerNode so all nodes look identical
  const totalSpan = (layout.colsPerNode - 1) * spacingX + execWidth;
  const startX = x + PAD;

      const execY = y + NODE_HEADER_SPACE;
      const execCores = Math.max(1, Number(executorCores.value) || 1);

      // draw capacity columns (colsPerNode) — each column's vCPU count comes from node vCPUs
          for(let colIdx = 0; colIdx < layout.colsPerNode; colIdx++){
        const colX = startX + colIdx * spacingX;
        const isUsed = colIdx < per;
            // decide if this column is the AM slot(s) (placed on first node's first columns)
            const isAmHere = distribution.amPlaced && (idx === distribution.amNodeIndex) && (colIdx < AM_EXECUTORS);

        // compute how many vCPUs this column represents: full execCores except possibly the last column
        const isLastCol = (colIdx === layout.colsPerNode - 1);
        const colCapacity = isLastCol ? Math.max(1, nodeCores - execCores * (layout.colsPerNode - 1)) : execCores;

            if(isUsed){
              // draw executor box for used column; use khaki for AM
              const color = isAmHere ? '#f0e68c' : '#f8fbff';
              drawBeveledRect(ctx, colX, execY, execWidth, nodeHeight - NODE_HEADER_SPACE - NODE_FOOTER_SPACE, {filled:true, style:'outset', color});
              ctx.fillStyle = '#0b3255'; ctx.font='11px Segoe UI';
              ctx.fillText(isAmHere ? 'AM' : ('Ex ' + (colIdx+1)), colX + 6, execY + 12);
            }

        // draw vertical cores in this column — number equals column capacity; colored if column is used
        const coreColX = colX + Math.round((execWidth - CORE_SIZE) / 2);
        for(let r=0; r<colCapacity; r++){
          const cy = execY + EXECUTOR_HEADER_SPACE + r * (CORE_SIZE + CORE_SPACE);
          // a core is 'used' if the column holds an executor and the executor consumes that core index
          const usedFlag = isUsed && (r < execCores);
          drawVcpu(ctx, coreColX, cy, usedFlag);
        }
      }

      // NOTE: any executors beyond colsPerNode (shouldn't happen with normal capacity math) will be ignored here —
      // they are counted as unplaced in the distribution and shown in the summary.

      // summary text on node
      ctx.fillStyle='#0b3255'; ctx.fillText(per + ' / ' + distribution.slotsPerNode + ' executors', x + 12, y + nodeHeight - 8);
    }
  }

  function updateUI(){
    const params = {
      executorCores: Number(executorCores.value) || 1,
      executorMemoryGb: Number(executorMemoryGb.value) || 1,
      executorOverheadFactor: Number(executorOverheadFactor && executorOverheadFactor.value) || 0.1875,
      maxExecutors: Number(maxExecutors.value) || 0,
      nodeVcpus: Number(nodeVcpus.value) || 1,
      nodeMemoryGb: Number(nodeMemoryGb.value) || 1,
      fixedNodes: false
    };

    const distribution = computeDistribution(params);

    // summary text: nodes needed, unplaced (if any), and total unused vCPUs with number
    let txt = `Nodes needed: <b>${distribution.nodesNeeded}</b> `;
    if(distribution.unplaced && distribution.unplaced > 0){
      txt += `Unplaced executors: <b>${distribution.unplaced}</b> `;
    }

    // compute total unused vCPUs across all nodes (node vCPUs minus used cores per node)
    const totalUnusedVcpus = (distribution.perNode || []).reduce((acc, placed) => {
      const usedCores = Math.max(0, placed) * Math.max(1, params.executorCores);
      const unused = Math.max(0, Math.floor(params.nodeVcpus) - usedCores);
      return acc + unused;
    }, 0);

    // render summary as HTML and bold numeric values
    txt += ` • Unused vCPUs: <b>${totalUnusedVcpus}</b>`;

    // compute max executor memory per node using the requested formula:
    // 1) executorsPerNode = distribution.slotsPerNode
    // 2) perExecRaw = floor(nodeMemoryGb / executorsPerNode) [GB]
    // 3) final = floor(perExecRaw * (1.0 - overheadFact))
    const executorsPerNode = Math.max(0, distribution.slotsPerNode || 0);
    let maxExecutorMemGb = 0;
    if(executorsPerNode > 0){
      const perExecRaw = Math.floor(Number(params.nodeMemoryGb) / executorsPerNode);
      const overheadFct = Number(params.executorOverheadFactor) || 0.0;
      maxExecutorMemGb = Math.floor(perExecRaw * (1.0 - overheadFct));
    }
    txt += ` • Max calculated executor memory: <b>${maxExecutorMemGb} GB</b>`;

    summary.innerHTML = txt;

  // compute layout to avoid zooming nodes; layout uses CSS pixels
  // use the parent container width to decide how many nodes fit per row (prevents canvas CSS scaling horizontally)
  const containerW = (canvas.parentElement && canvas.parentElement.clientWidth) ? canvas.parentElement.clientWidth : (canvas.clientWidth || NODE_WIDTH);
  const areaW = containerW - PAD*2;
  const nodes = distribution.perNode.length || distribution.nodesNeeded;

  // executor and node core counts
  const execCores = Math.max(1, Number(executorCores.value) || 1);
  const nodeCores = Math.max(1, Math.floor(Number(nodeVcpus.value) || 1));

  // executor box metrics
  const execWidth = CORE_SIZE + EXECUTOR_H_PADDING * 2;
  const spacingX = execWidth + PAD;

  // node width is determined by how many executor columns fit given node cores
    const colsPerNode = Math.max(1, Math.ceil(nodeCores / execCores));
    const nodeW = PAD + colsPerNode * (execWidth + PAD);

  // grid dimensions (how many node boxes fit into the container width)
  const columns = Math.max(1, Math.floor((areaW + NODE_GAP) / (nodeW + NODE_GAP)));
  const rows = Math.ceil(nodes / columns) || 1;

  // node height depends on executor cores (vertical column height)
  const executorHeight = EXECUTOR_HEADER_SPACE + execCores * CORE_SIZE + Math.max(0, execCores - 1) * CORE_SPACE + EXECUTOR_FOOTER_SPACE;
  const nodeHeight = NODE_HEADER_SPACE + executorHeight + NODE_FOOTER_SPACE; // in CSS px

  // required CSS width/height for the whole grid
  const totalGridWidth = columns * nodeW + Math.max(0, columns - 1) * NODE_GAP;
  const requiredWidth = PAD + totalGridWidth + PAD;
  const requiredHeight = PAD + rows * nodeHeight + Math.max(0, rows - 1) * NODE_GAP + PAD;

  // clamp grid width to container width so there's no horizontal scrolling (grid will wrap nodes)
  const clampedWidth = Math.max(containerW, Math.min(requiredWidth, containerW));
  // use clampedWidth for CSS width so the canvas fits the container (no horizontal scroll)
  canvas.style.width = clampedWidth + 'px';
  canvas.style.height = requiredHeight + 'px';

  // now set canvas bitmap size according to DPR and CSS size (use CSS sizes we just set)
  const ratio = window.devicePixelRatio || 1;
  const w = clampedWidth;
  const h = requiredHeight;
  canvas.width = Math.floor(w * ratio);
  canvas.height = Math.floor(h * ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);

  // prepare layout object passed into draw
  const layout = {
    nodeW,
    colsPerNode,
    columns,
    rows,
    nodeHeight,
    offsetX: PAD + Math.round(((requiredWidth - PAD*2) - totalGridWidth) / 2),
    execWidth,
    spacingX
  };

  draw(distribution, layout);
  }

  // Tab switching for Visual / Optimal Combinations
  const tabVisualBtn = document.getElementById('tab-visual-btn');
  const tabOptimalBtn = document.getElementById('tab-optimal-btn');
  const tabVisual = document.getElementById('tab-visual');
  const tabOptimal = document.getElementById('tab-optimal');
  const optimalTableBody = document.getElementById('optimalTableBody');

  function showTab(name){
    if(name === 'visual'){
      tabVisual.style.display = '';
      tabOptimal.style.display = 'none';
      tabVisualBtn.classList.add('active');
      tabOptimalBtn.classList.remove('active');
    } else {
      tabVisual.style.display = 'none';
      tabOptimal.style.display = '';
      tabVisualBtn.classList.remove('active');
      tabOptimalBtn.classList.add('active');
    }
  }

  tabVisualBtn.addEventListener('click', ()=> showTab('visual'));
  tabOptimalBtn.addEventListener('click', ()=> showTab('optimal'));

  // compute optimal combinations table (called from updateUI)
  function populateOptimalTable(params){
    // clear
    optimalTableBody.innerHTML = '';
    const maxCores = Math.max(2, Math.floor(params.nodeVcpus));
    const targetNodes = Math.max(1, Number(targetMaxNodes && targetMaxNodes.value) || 1);
    for(let cores = 2; cores <= maxCores; cores++){
      // Prioritize CPU: compute slots purely by cores (floor(nodeVcpus / cores))
      const slotsPerNodeByCores = Math.max(0, Math.floor(Number(params.nodeVcpus) / cores));
      const unusedPerNode = Math.max(0, Math.floor(Number(params.nodeVcpus)) - (slotsPerNodeByCores * cores));

      // derive max executor memory by dividing node memory by slotsPerNode (cores-first), then apply overhead
      let maxExecMem = 0;
      if(slotsPerNodeByCores > 0){
        const perExecRaw = Math.floor(Number(params.nodeMemoryGb) / slotsPerNodeByCores);
        const overheadFct = Number(params.executorOverheadFactor) || 0.0;
        maxExecMem = Math.floor(perExecRaw * (1.0 - overheadFct));
      }

      // compute max executors using target nodes: slotsPerNodeByCores * targetNodes minus AMs
      const maxExecutorsByTarget = Math.max(0, (slotsPerNodeByCores * targetNodes) - AM_EXECUTORS);
  // shuffle partitions heuristic: cores per executor * number of executors * 4
  const shufflePartitions = Math.max(1, cores * maxExecutorsByTarget * 4);

      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${cores}</td><td>${unusedPerNode}</td><td>${maxExecMem}</td><td>${maxExecutorsByTarget}</td><td>${shufflePartitions}</td>`;
      // Show Configuration button cell
      const tdBtn = document.createElement('td');
      const btn = document.createElement('button');
      btn.textContent = `${cores} Cores`;
      btn.addEventListener('click', ()=>{
        // populate inputs with values from this row
        if(executorCores) executorCores.value = cores;
        if(executorMemoryGb) executorMemoryGb.value = maxExecMem;
        if(maxExecutors) maxExecutors.value = maxExecutorsByTarget;
        // switch to visual tab
        showTab('visual');
        // trigger immediate UI update
        updateUI();
      });
      tdBtn.appendChild(btn);
      tr.appendChild(tdBtn);
      optimalTableBody.appendChild(tr);
    }
  }

  // enhance updateUI to also populate the table
  const originalUpdateUI = updateUI;
  updateUI = function(){
    originalUpdateUI();
    const params = {
        executorCores: Number(executorCores.value) || 1,
        executorMemoryGb: Number(executorMemoryGb.value) || 1,
  executorOverheadFactor: Number(executorOverheadFactor && executorOverheadFactor.value) || 0.1875,
        maxExecutors: Number(maxExecutors.value) || 0,
        nodeVcpus: Number(nodeVcpus.value) || 1,
        nodeMemoryGb: Number(nodeMemoryGb.value) || 1,
        fixedNodes: false
      };
    populateOptimalTable(params);
  };

  // debounce helper
  function debounce(fn, wait){
    let t = null;
    return function(...args){
      if(t) clearTimeout(t);
      t = setTimeout(()=>{ t = null; fn.apply(this,args); }, wait);
    };
  }

  const debouncedUpdate = debounce(updateUI, 120);

  // attach listeners to all inputs for live update
  [executorCores, executorMemoryGb, executorOverheadFactor, maxExecutors, targetMaxNodes, nodeVcpus, nodeMemoryGb].forEach(el => {
    if(el) el.addEventListener('input', debouncedUpdate);
  });

  // keyboard-reset: double-click on header to reset defaults
  const header = document.querySelector('header');
  if(header){
    header.addEventListener('dblclick', ()=>{
      executorCores.value=4; executorMemoryGb.value=8; maxExecutors.value=10; nodeVcpus.value=16; nodeMemoryGb.value=64; updateUI();
    });
  }

  // initial render
  updateUI();

})();
