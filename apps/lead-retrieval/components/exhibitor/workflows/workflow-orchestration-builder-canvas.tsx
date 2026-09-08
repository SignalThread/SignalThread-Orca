"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";

import type { WorkflowCanvasStep } from "./workflow-builder-graph";
import { workflowBuilderEdgeTypes, workflowBuilderNodeTypes } from "./workflow-builder-nodes";

function WorkflowOrchestrationCanvasShell({ children }: { children: ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

function WorkflowFlowCanvasInner({
  nodes,
  edges,
  onStepSelected
}: {
  nodes: Node[];
  edges: Edge[];
  onStepSelected: (step: WorkflowCanvasStep) => void;
}) {
  const { fitView } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);

  const centerWorkflow = useCallback(() => {
    fitView({ padding: 0.18, duration: 280, maxZoom: 1 });
  }, [fitView]);

  useEffect(() => {
    const t = window.setTimeout(centerWorkflow, 50);
    return () => window.clearTimeout(t);
  }, [centerWorkflow, nodes.length, edges.length]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => centerWorkflow());
    observer.observe(element);
    return () => observer.disconnect();
  }, [centerWorkflow]);

  return (
    <div ref={canvasRef} className="h-full min-w-0 w-full [container-type:inline-size]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={workflowBuilderNodeTypes}
        edgeTypes={workflowBuilderEdgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        minZoom={0.4}
        maxZoom={1.25}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          const id = node.id as WorkflowCanvasStep;
          onStepSelected(id);
        }}
        fitView
        className="!bg-[radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.18)_1px,transparent_0),linear-gradient(180deg,#ffffff_0%,#f8fafc_52%,#f1f5f9_100%)] !bg-[length:22px_22px,100%_100%]"
      >
        <Background
          id="wf-bg"
          gap={22}
          size={1}
          color="rgba(100, 116, 139, 0.10)"
          variant={BackgroundVariant.Dots}
        />
        <Controls
          position="bottom-right"
          className="!m-4 !overflow-hidden !rounded-lg !border !border-slate-200/90 !bg-white/95 !shadow-md !backdrop-blur-sm [&_button]:!rounded-md [&_button]:!border-slate-200 [&_button]:!bg-white [&_button]:!fill-slate-600 [&_button:hover]:!bg-slate-50"
        />
      </ReactFlow>
    </div>
  );
}

export function WorkflowFlowCanvas(props: {
  nodes: Node[];
  edges: Edge[];
  onStepSelected: (step: WorkflowCanvasStep) => void;
}) {
  return (
    <WorkflowOrchestrationCanvasShell>
      <WorkflowFlowCanvasInner {...props} />
    </WorkflowOrchestrationCanvasShell>
  );
}
