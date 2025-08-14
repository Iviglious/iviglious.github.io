// Node Optimizer - visualization logic
(function(){
  const $ = id => document.getElementById(id);
  const executorCores = $('executorCores');
  const executorMemoryGb = $('executorMemoryGb');
  const maxExecutors = $('maxExecutors');
  const numNodes = $('numNodes');
  const nodeVcpus = $('nodeVcpus');
  const nodeMemoryGb = $('nodeMemoryGb');
  const fixedNodes = $('fixedNodes');
  // buttons removed; wire inputs to auto-update
  const summary = $('summary');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  function computeDistribution(params){
    // params: {executorCores, executorMemoryGb, maxExecutors, numNodes, nodeVcpus, nodeMemoryGb, fixedNodes}
    const execCores = params.executorCores;
    const execMem = params.executorMemoryGb;
    const totalExecutors = params.maxExecutors;
    const vcpusPerNode = params.nodeVcpus;
    const memPerNode = params.nodeMemoryGb;

    // How many executor slots per node by CPU and memory
    const slotsByCpu = Math.floor(vcpusPerNode / execCores) || 0;
    const slotsByMem = Math.floor(memPerNode / execMem) || 0;
    const slotsPerNode = Math.max(0, Math.min(slotsByCpu, slotsByMem));

    if(slotsPerNode === 0){
      return {slotsPerNode:0, nodesNeeded: totalExecutors>0?Infinity:0, perNode:[]}
    }

    if(params.fixedNodes){
      const nodes = params.numNodes;
      // fill nodes up to capacity with executors until totalExecutors placed or nodes full
      const perNode = Array(nodes).fill(0);
      let remaining = totalExecutors;
      for(let i=0;i<nodes && remaining>0;i++){
        const put = Math.min(remaining, slotsPerNode);
        perNode[i]=put; remaining-=put;
      }
      const unplaced = remaining;
      return {slotsPerNode, nodesNeeded: nodes, perNode, unplaced}
    } else {
      // compute minimal nodes needed to place totalExecutors
      const nodesNeeded = Math.ceil(totalExecutors / slotsPerNode);
      const perNode = [];
      let remaining = totalExecutors;
      for(let i=0;i<nodesNeeded;i++){
        const put = Math.min(remaining, slotsPerNode);
        perNode.push(put); remaining-=put;
      }
      return {slotsPerNode, nodesNeeded, perNode}
    }
  }

  function draw(distribution){
    // clear
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const pad = 20;
    const areaW = canvas.width - pad*2;
    const areaH = canvas.height - pad*2;

    if(distribution.slotsPerNode===0){
      ctx.fillStyle='#b23';
      ctx.font='18px Segoe UI';
      ctx.fillText('No executors fit in a node with given parameters.', pad, 60);
      return;
    }

    const nodes = distribution.perNode.length || distribution.nodesNeeded;
    // layout nodes in rows
    const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(nodes))));
    const rows = Math.ceil(nodes/cols);
    const nodeW = Math.floor(areaW/cols - 12);
    const nodeH = Math.floor(areaH/rows - 24);

    let idx=0;
    ctx.font='12px Segoe UI';
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        if(idx>=nodes) break;
        const x = pad + c*(nodeW+12);
        const y = pad + r*(nodeH+24);
        // draw node box
        ctx.strokeStyle='#0b3255';
        ctx.lineWidth=2;
        ctx.strokeRect(x,y,nodeW,nodeH);
        ctx.fillStyle='#083049';
        ctx.fillText('Node ' + (idx+1), x+6, y+16);

        // draw executors inside
        const per = distribution.perNode[idx] || 0;
        const slots = distribution.slotsPerNode;
        // draw grid of executor boxes
        const colsExec = Math.max(1, Math.min(slots, 4));
        const rowsExec = Math.ceil(slots/colsExec);
        const execW = (nodeW - 12) / colsExec;
        const execH = (nodeH - 28) / rowsExec;

        for(let e=0;e<slots;e++){
          const er = Math.floor(e/colsExec);
          const ec = e%colsExec;
          const ex = x + 6 + ec*execW;
          const ey = y + 20 + er*execH;
          // filled if executed assigned
          if(e < per){
            ctx.fillStyle = '#0b6cff';
            ctx.fillRect(ex+4, ey+4, execW-8, execH-8);
            ctx.fillStyle = '#fff';
            ctx.fillText('E', ex+8, ey+16);
          } else {
            ctx.strokeStyle = '#9fb6d6';
            ctx.strokeRect(ex+4, ey+4, execW-8, execH-8);
          }
        }

        // show counts
        ctx.fillStyle='#0b3255';
        ctx.fillText(per + ' / ' + slots + ' executors', x+6, y+nodeH-6);

        idx++;
      }
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

    // adjust canvas resolution for crisp drawing
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);

    draw(distribution);
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
    el.addEventListener('input', debouncedUpdate);
  });
  fixedNodes.addEventListener('change', debouncedUpdate);

  // keyboard-reset: double-click on header to reset defaults
  document.querySelector('header').addEventListener('dblclick', ()=>{
    executorCores.value=4; executorMemoryGb.value=8; maxExecutors.value=10; numNodes.value=3; nodeVcpus.value=16; nodeMemoryGb.value=64; fixedNodes.checked=false; updateUI();
  });

  // initial render
  updateUI();

})();
