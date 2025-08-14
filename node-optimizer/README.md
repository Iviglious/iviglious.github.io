Node Optimizer - Spark Executor Visualizer

Static subsite files. Open `index.html` in a browser.

Parameters:
- executor cores
- executor memory (GB)
- max executors
- number of nodes
- node vCPUs
- node memory (GB)

Options:
- treat number of nodes as fixed (checkbox)

How it works:
- Computes slots per node by min(vCPUs/executorCores, nodeMemory/executorMemory).
- Distributes executors across nodes and draws a canvas showing nodes and executor boxes.

This is a simple static HTML/CSS/JS site; no dependencies.
