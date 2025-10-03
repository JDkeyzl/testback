import React from 'react'
import { Button } from './ui/button'
import { Plus, Trash2, Download, Upload } from 'lucide-react'

const nodeTypes = [
  { type: 'condition', label: '条件节点', description: '技术指标条件' },
  { type: 'logic', label: '逻辑节点', description: 'AND/OR/NOT' },
  { type: 'action', label: '动作节点', description: '买入/卖出信号' }
]

export function NodeToolbar({ onAddNode, onClearAll, onSave, onLoad }) {
  return (
    <div className="flex items-center justify-between w-full">
      {/* 左侧：节点添加按钮 */}
      <div className="flex items-center space-x-3">
        <span className="text-sm font-medium text-foreground">添加节点：</span>
        {nodeTypes.map((nodeType) => (
          <div
            key={nodeType.type}
            className="p-3 border border-border rounded-lg cursor-pointer hover:bg-accent transition-colors bg-card/50 backdrop-blur-sm"
            onClick={() => onAddNode(nodeType.type)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/reactflow', nodeType.type)
              e.dataTransfer.effectAllowed = 'move'
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Plus className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{nodeType.label}</span>
            </div>
            <div className="text-xs text-muted-foreground">{nodeType.description}</div>
          </div>
        ))}
      </div>

      {/* 右侧：操作按钮 */}
      <div className="flex items-center space-x-2">
        <Button size="sm" variant="outline" onClick={onSave}>
          <Download className="h-4 w-4 mr-2" />
          保存策略
        </Button>
        <Button size="sm" variant="outline" onClick={onLoad}>
          <Upload className="h-4 w-4 mr-2" />
          加载策略
        </Button>
        <Button size="sm" variant="outline" onClick={onClearAll}>
          <Trash2 className="h-4 w-4 mr-2" />
          清空画布
        </Button>
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          重置策略
        </Button>
      </div>
    </div>
  )
}
