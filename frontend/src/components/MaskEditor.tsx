import { useState, useRef, useEffect, useCallback } from 'react';
import { MaskRect } from '../api';

interface MaskEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (masks: MaskRect[]) => void;
  initialMasks: MaskRect[];
}

type DragMode = 'none' | 'draw' | 'move' | 'resize';
type Corner = 'tl' | 'tr' | 'bl' | 'br';

export function MaskEditor({ isOpen, onClose, onSave, initialMasks }: MaskEditorProps) {
  const [masks, setMasks] = useState<MaskRect[]>([]);
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<MaskRect | null>(null);
  const [activeMaskIndex, setActiveMaskIndex] = useState<number | null>(null);
  const [activeCorner, setActiveCorner] = useState<Corner | null>(null);
  const [originalMask, setOriginalMask] = useState<MaskRect | null>(null);
  const [hoveredMaskIndex, setHoveredMaskIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Initialize masks when opening
  useEffect(() => {
    if (isOpen) {
      setMasks([...initialMasks]);
      setDragMode('none');
      setActiveMaskIndex(null);
    }
  }, [isOpen, initialMasks]);

  // Get normalized coordinates from mouse event
  const getNormalizedCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!imgRef.current) return null;
    
    const rect = imgRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    
    // Clamp to 0-1 range (snaps to edges when cursor is outside)
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }, []);

  // Start drawing a new mask
  const handleStartDraw = useCallback((e: React.MouseEvent) => {
    const coords = getNormalizedCoords(e.clientX, e.clientY);
    if (!coords) return;
    
    setDragMode('draw');
    setDragStart(coords);
    setCurrentRect({
      x: coords.x,
      y: coords.y,
      width: 0,
      height: 0,
    });
  }, [getNormalizedCoords]);

  // Start moving a mask
  const handleStartMove = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const coords = getNormalizedCoords(e.clientX, e.clientY);
    if (!coords) return;
    
    setDragMode('move');
    setDragStart(coords);
    setActiveMaskIndex(index);
    setOriginalMask({ ...masks[index] });
  }, [getNormalizedCoords, masks]);

  // Start resizing a mask from a corner
  const handleStartResize = useCallback((e: React.MouseEvent, index: number, corner: Corner) => {
    e.stopPropagation();
    const coords = getNormalizedCoords(e.clientX, e.clientY);
    if (!coords) return;
    
    setDragMode('resize');
    setDragStart(coords);
    setActiveMaskIndex(index);
    setActiveCorner(corner);
    setOriginalMask({ ...masks[index] });
  }, [getNormalizedCoords, masks]);

  // Handle global mouse events during any drag operation
  useEffect(() => {
    if (dragMode === 'none' || !dragStart) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const coords = getNormalizedCoords(e.clientX, e.clientY);
      if (!coords) return;

      if (dragMode === 'draw') {
        // Drawing new mask
        const x = Math.min(dragStart.x, coords.x);
        const y = Math.min(dragStart.y, coords.y);
        const width = Math.abs(coords.x - dragStart.x);
        const height = Math.abs(coords.y - dragStart.y);
        setCurrentRect({ x, y, width, height });
      } else if (dragMode === 'move' && activeMaskIndex !== null && originalMask) {
        // Moving existing mask
        const dx = coords.x - dragStart.x;
        const dy = coords.y - dragStart.y;
        
        let newX = originalMask.x + dx;
        let newY = originalMask.y + dy;
        
        // Clamp to keep mask within bounds
        newX = Math.max(0, Math.min(1 - originalMask.width, newX));
        newY = Math.max(0, Math.min(1 - originalMask.height, newY));
        
        setMasks(prev => prev.map((m, i) => 
          i === activeMaskIndex 
            ? { ...m, x: newX, y: newY }
            : m
        ));
      } else if (dragMode === 'resize' && activeMaskIndex !== null && activeCorner && originalMask) {
        // Resizing from corner
        let newX = originalMask.x;
        let newY = originalMask.y;
        let newWidth = originalMask.width;
        let newHeight = originalMask.height;
        
        const dx = coords.x - dragStart.x;
        const dy = coords.y - dragStart.y;
        
        // Adjust based on which corner is being dragged
        if (activeCorner === 'tl') {
          newX = Math.min(originalMask.x + originalMask.width - 0.02, originalMask.x + dx);
          newY = Math.min(originalMask.y + originalMask.height - 0.02, originalMask.y + dy);
          newWidth = originalMask.width - (newX - originalMask.x);
          newHeight = originalMask.height - (newY - originalMask.y);
        } else if (activeCorner === 'tr') {
          newY = Math.min(originalMask.y + originalMask.height - 0.02, originalMask.y + dy);
          newWidth = Math.max(0.02, originalMask.width + dx);
          newHeight = originalMask.height - (newY - originalMask.y);
        } else if (activeCorner === 'bl') {
          newX = Math.min(originalMask.x + originalMask.width - 0.02, originalMask.x + dx);
          newWidth = originalMask.width - (newX - originalMask.x);
          newHeight = Math.max(0.02, originalMask.height + dy);
        } else if (activeCorner === 'br') {
          newWidth = Math.max(0.02, originalMask.width + dx);
          newHeight = Math.max(0.02, originalMask.height + dy);
        }
        
        // Clamp to bounds
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        if (newX + newWidth > 1) newWidth = 1 - newX;
        if (newY + newHeight > 1) newHeight = 1 - newY;
        
        setMasks(prev => prev.map((m, i) => 
          i === activeMaskIndex 
            ? { x: newX, y: newY, width: newWidth, height: newHeight }
            : m
        ));
      }
    };

    const handleGlobalMouseUp = () => {
      if (dragMode === 'draw' && currentRect && currentRect.width > 0.01 && currentRect.height > 0.01) {
        setMasks(prev => [...prev, currentRect]);
      }
      
      setDragMode('none');
      setDragStart(null);
      setCurrentRect(null);
      setActiveMaskIndex(null);
      setActiveCorner(null);
      setOriginalMask(null);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragMode, dragStart, currentRect, activeMaskIndex, activeCorner, originalMask, getNormalizedCoords]);

  const handleDeleteMask = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setMasks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(() => {
    onSave(masks);
    onClose();
  }, [masks, onSave, onClose]);

  const handleCancel = useCallback(() => {
    setMasks([]);
    onClose();
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCancel]);

  // Get pixel position for overlay elements
  const getPixelPosition = useCallback((normalizedX: number, normalizedY: number) => {
    if (!imgRef.current || !containerRef.current) return { x: 0, y: 0 };
    
    const imgRect = imgRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    
    const imgOffsetX = (containerRect.width - imgRect.width) / 2;
    const imgOffsetY = (containerRect.height - imgRect.height) / 2;
    
    return {
      x: imgOffsetX + normalizedX * imgRect.width,
      y: imgOffsetY + normalizedY * imgRect.height,
    };
  }, []);

  if (!isOpen) return null;

  const cornerSize = 10;
  const isInteracting = dragMode !== 'none';

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div>
            <h2 className="text-xl font-display font-bold text-white">Edit Camera Masks</h2>
            <p className="text-sm text-stinger-muted mt-1">
              Draw rectangles to mask areas from face recognition. {masks.length} mask{masks.length !== 1 ? 's' : ''} defined.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn btn-primary"
            >
              Save Masks
            </button>
          </div>
        </div>
      </div>

      {/* Video container with mask overlay */}
      <div 
        ref={containerRef}
        className="relative max-w-5xl w-full mx-4"
      >
        <div className="relative aspect-video bg-stinger-surface rounded-lg overflow-hidden">
          {/* Live video feed */}
          <img
            ref={imgRef}
            src="/api/kiosk/stream"
            alt="Live Camera Feed"
            className="w-full h-full object-contain select-none"
            draggable={false}
            onMouseDown={handleStartDraw}
          />
          
          {/* Existing masks overlay */}
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ overflow: 'visible' }}
          >
            {masks.map((mask, index) => {
              const isHovered = hoveredMaskIndex === index;
              const isActive = activeMaskIndex === index;
              
              return (
                <g key={index}>
                  {/* Mask rectangle - clickable for moving */}
                  <rect
                    x={`${mask.x * 100}%`}
                    y={`${mask.y * 100}%`}
                    width={`${mask.width * 100}%`}
                    height={`${mask.height * 100}%`}
                    fill="rgba(255, 255, 255, 0.3)"
                    stroke="#00ff88"
                    strokeWidth={isHovered || isActive ? "3" : "2"}
                    strokeDasharray="8 4"
                    className="pointer-events-auto cursor-move"
                    onMouseDown={(e) => handleStartMove(e, index)}
                    onMouseEnter={() => setHoveredMaskIndex(index)}
                    onMouseLeave={() => !isInteracting && setHoveredMaskIndex(null)}
                  />
                  
                  {/* Corner handles */}
                  {/* Top-left */}
                  <circle
                    cx={`${mask.x * 100}%`}
                    cy={`${mask.y * 100}%`}
                    r={cornerSize}
                    fill="#00ff88"
                    stroke="white"
                    strokeWidth="2"
                    className="pointer-events-auto cursor-nwse-resize"
                    onMouseDown={(e) => handleStartResize(e, index, 'tl')}
                  />
                  {/* Top-right */}
                  <circle
                    cx={`${(mask.x + mask.width) * 100}%`}
                    cy={`${mask.y * 100}%`}
                    r={cornerSize}
                    fill="#00ff88"
                    stroke="white"
                    strokeWidth="2"
                    className="pointer-events-auto cursor-nesw-resize"
                    onMouseDown={(e) => handleStartResize(e, index, 'tr')}
                  />
                  {/* Bottom-left */}
                  <circle
                    cx={`${mask.x * 100}%`}
                    cy={`${(mask.y + mask.height) * 100}%`}
                    r={cornerSize}
                    fill="#00ff88"
                    stroke="white"
                    strokeWidth="2"
                    className="pointer-events-auto cursor-nesw-resize"
                    onMouseDown={(e) => handleStartResize(e, index, 'bl')}
                  />
                  {/* Bottom-right */}
                  <circle
                    cx={`${(mask.x + mask.width) * 100}%`}
                    cy={`${(mask.y + mask.height) * 100}%`}
                    r={cornerSize}
                    fill="#00ff88"
                    stroke="white"
                    strokeWidth="2"
                    className="pointer-events-auto cursor-nwse-resize"
                    onMouseDown={(e) => handleStartResize(e, index, 'br')}
                  />
                </g>
              );
            })}
            
            {/* Currently drawing rectangle */}
            {currentRect && (
              <rect
                x={`${currentRect.x * 100}%`}
                y={`${currentRect.y * 100}%`}
                width={`${currentRect.width * 100}%`}
                height={`${currentRect.height * 100}%`}
                fill="rgba(0, 255, 136, 0.2)"
                stroke="#00ff88"
                strokeWidth="2"
              />
            )}
          </svg>

          {/* Delete buttons for masks - positioned at bottom center of each mask */}
          {masks.map((mask, index) => {
            const pos = getPixelPosition(mask.x + mask.width / 2, mask.y + mask.height);
            
            return (
              <button
                key={`delete-${index}`}
                onMouseDown={(e) => handleDeleteMask(e, index)}
                className={`absolute w-8 h-8 flex items-center justify-center rounded-full 
                  bg-stinger-warning text-white shadow-lg transition-all duration-200
                  hover:scale-110 hover:bg-red-500 -translate-x-1/2 -translate-y-[calc(100%+8px)]
                  ${hoveredMaskIndex === index || activeMaskIndex === index ? 'opacity-100' : 'opacity-70'}`}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                }}
                title="Delete mask"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            );
          })}

          {/* Instructions overlay when no masks */}
          {masks.length === 0 && dragMode === 'none' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/70 rounded-lg px-6 py-4 text-center">
                <p className="text-stinger-accent font-medium">Click and drag to draw a mask</p>
                <p className="text-stinger-muted text-sm mt-1">Masked areas will be excluded from face recognition</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer with instructions */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="text-center text-stinger-muted text-sm">
          <span className="inline-flex items-center gap-2 flex-wrap justify-center">
            <kbd className="px-2 py-1 bg-stinger-surface rounded text-xs">Click + Drag</kbd>
            <span>to create</span>
            <span className="mx-1">|</span>
            <kbd className="px-2 py-1 bg-stinger-surface rounded text-xs">Drag mask</kbd>
            <span>to move</span>
            <span className="mx-1">|</span>
            <kbd className="px-2 py-1 bg-stinger-surface rounded text-xs">Drag corners</kbd>
            <span>to resize</span>
            <span className="mx-1">|</span>
            <kbd className="px-2 py-1 bg-stinger-surface rounded text-xs">Esc</kbd>
            <span>to cancel</span>
          </span>
        </div>
      </div>
    </div>
  );
}
