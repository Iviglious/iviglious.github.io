// Node Optimizer - visualization logic
(function(){
  // helpers
  const $ = id => document.getElementById(id);

  // DOM refs
  const executorCores = $('executorCores');
  const executorMemoryGb = $('executorMemoryGb');
  const maxExecutors = $('maxExecutors');
  const numNodes = $('numNodes');
  const nodeVcpus = $('nodeVcpus');
  const nodeMemoryGb = $('nodeMemoryGb');
  const fixedNodes = $('fixedNodes');
  const summary = $('summary');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  // Layout / visual constants (tweakable)
  const PAD = 20;
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
    const memPerExec = Math.max(1, params.executorMemoryGb);
    const coresPerNode = Math.max(1, Math.floor(params.nodeVcpus));
    const memPerNode = Math.max(1, params.nodeMemoryGb);

    const slotsByCores = Math.floor(coresPerNode / coresPerExec);
    const slotsByMem = Math.floor(memPerNode / memPerExec);
    const slotsPerNode = Math.max(0, Math.min(slotsByCores, slotsByMem));

    let nodesNeeded = 0;
    let unplaced = 0;
    let perNode = [];

    if(params.fixedNodes){
      nodesNeeded = params.numNodes;
      const capacity = slotsPerNode * nodesNeeded;
      const placed = Math.min(capacity, params.maxExecutors);
      unplaced = Math.max(0, params.maxExecutors - placed);
      // distribute evenly (simple fill)
      let remaining = Math.min(placed, capacity);
      for(let i=0;i<nodesNeeded;i++){
        const take = Math.min(slotsPerNode, remaining);
        perNode.push(take);
        remaining -= take;
      }
    } else {
      if(slotsPerNode === 0){
        nodesNeeded = Math.ceil(params.maxExecutors / 1); // each executor needs at least something
        unplaced = params.maxExecutors;
      } else {
        nodesNeeded = Math.ceil(params.maxExecutors / slotsPerNode);
        let remaining = params.maxExecutors;
        for(let i=0;i<nodesNeeded;i++){
          const take = Math.min(slotsPerNode, remaining);
          perNode.push(take);
          remaining -= take;
        }
      }
    }

    return { slotsPerNode, nodesNeeded, perNode, unplaced };
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
      ctx.fillStyle = '#083049'; ctx.font='12px Segoe UI'; ctx.fillText('Node ' + (idx+1), x + 12, y + 14);

      // compute starting X so executors are centered inside the node
      const totalSpan = per > 0 ? (per - 1) * spacingX + execWidth : execWidth;
      const startX = x + Math.max(12, Math.round((nodeW - totalSpan) / 2));

      const execY = y + NODE_HEADER_SPACE;
      // draw executors horizontally
      const execCores = Math.max(1, Number(executorCores.value) || 1);
      for(let e=0; e<per; e++){
        const exX = startX + e * spacingX; // left edge of executor box
        drawBeveledRect(ctx, exX, execY, execWidth, nodeHeight - NODE_HEADER_SPACE - NODE_FOOTER_SPACE, {filled:true, style:'outset', color:'#f8fbff'});
        ctx.fillStyle = '#0b3255'; ctx.font='11px Segoe UI';
        ctx.fillText('Ex ' + (e+1), exX + 6, execY + 12);

        const coreColX = exX + Math.round((execWidth - CORE_SIZE) / 2);
        for(let c=0; c<execCores; c++){
          const cy = execY + EXECUTOR_HEADER_SPACE + c * (CORE_SIZE + CORE_SPACE);
          drawVcpu(ctx, coreColX, cy);
        }
      }

      // draw leftover cores in gray
      const nodeCores = Math.max(1, Math.floor(Number(nodeVcpus.value) || 1));
      const usedCores = per * Math.max(1, Number(executorCores.value) || 1);
      const leftover = Math.max(0, nodeCores - usedCores);
      if(leftover > 0){
        const leftX = per > 0 ? startX + per * spacingX : startX + Math.round((nodeW - execWidth) / 2) + execWidth + CORE_SPACE;
        for(let l=0; l<leftover; l++){
          const ly = execY + EXECUTOR_HEADER_SPACE + l * (CORE_SIZE + CORE_SPACE);
          drawVcpu(ctx, leftX, ly, false);
        }
      }

      // summary text on node
      ctx.fillStyle='#0b3255'; ctx.fillText(per + ' / ' + distribution.slotsPerNode + ' executors', x + 12, y + nodeHeight - 8);
    }
  }

  function updateUI(){
    const params = {
      executorCores: Number(executorCores.value) || 1,
      executorMemoryGb: Number(executorMemoryGb.value) || 1,
      maxExecutors: Number(maxExecutors.value) || 0,
      numNodes: Number(numNodes.value) || 1,
      nodeVcpus: Number(nodeVcpus.value) || 1,
      nodeMemoryGb: Number(nodeMemoryGb.value) || 1,
      fixedNodes: fixedNodes.checked
    };

    const distribution = computeDistribution(params);

    // summary text
    let txt = `Slots/node: ${distribution.slotsPerNode}. `;
    if(params.fixedNodes){
      txt += `Using ${params.numNodes} node(s). `;
      txt += distribution.unplaced>0 ? `Unplaced executors: ${distribution.unplaced}.` : `All ${params.maxExecutors} placed.`;
    } else {
      txt += `Nodes needed: ${distribution.nodesNeeded}. Total executors: ${params.maxExecutors}.`;
    }
    summary.textContent = txt;

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
  const spacingX = CORE_SIZE + CORE_SPACE;

  // node width is determined by how many executor columns fit given node cores
  const colsPerNode = Math.max(1, Math.ceil(nodeCores / execCores));
  const nodeW = colsPerNode * execWidth + Math.max(0, colsPerNode - 1) * CORE_SPACE + 24;

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

  // set canvas DOM/CSS size so the page will scroll instead of scaling canvas content
  canvas.style.width = requiredWidth + 'px';
  canvas.style.height = requiredHeight + 'px';

  // now set canvas bitmap size according to DPR and CSS size (use CSS sizes we just set)
  const ratio = window.devicePixelRatio || 1;
  const w = requiredWidth;
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
  [executorCores, executorMemoryGb, maxExecutors, numNodes, nodeVcpus, nodeMemoryGb].forEach(el => {
    if(el) el.addEventListener('input', debouncedUpdate);
  });
  if(fixedNodes) fixedNodes.addEventListener('change', debouncedUpdate);

  // keyboard-reset: double-click on header to reset defaults
  const header = document.querySelector('header');
  if(header){
    header.addEventListener('dblclick', ()=>{
      executorCores.value=4; executorMemoryGb.value=8; maxExecutors.value=10; numNodes.value=3; nodeVcpus.value=16; nodeMemoryGb.value=64; fixedNodes.checked=false; updateUI();
    });
  }

  // initial render
  updateUI();

})();
