import React, { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, ZoomIn, ZoomOut, RotateCcw, Check, X } from 'lucide-react';

interface ImageCropUploadProps {
  currentImage?: string;
  onImageChange: (imageDataUrl: string) => void;
  aspectRatio?: number;
}

export function ImageCropUpload({ 
  currentImage, 
  onImageChange,
  aspectRatio = 1 
}: ImageCropUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setZoom(1);
        setPosition({ x: 0, y: 0 });
        setIsOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.1, 0.5));
  };

  const handleReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleConfirm = useCallback(() => {
    if (!selectedImage || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const outputSize = 200;
      canvas.width = outputSize;
      canvas.height = outputSize;

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, outputSize, outputSize);

      const previewSize = 160;
      const scale = (previewSize * zoom) / Math.min(img.width, img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;

      const offsetX = (outputSize - scaledWidth) / 2 + (position.x * outputSize / previewSize);
      const offsetY = (outputSize - scaledHeight) / 2 + (position.y * outputSize / previewSize);

      ctx.beginPath();
      ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
      ctx.clip();

      ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      onImageChange(dataUrl);
      setIsOpen(false);
      setSelectedImage(null);
    };
    img.src = selectedImage;
  }, [selectedImage, zoom, position, onImageChange]);

  const handleCancel = () => {
    setIsOpen(false);
    setSelectedImage(null);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full mt-2 text-xs"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-3 h-3 mr-1" />
        Foto
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar Foto</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div 
              className="relative w-40 h-40 mx-auto rounded-full overflow-hidden bg-slate-800 border-2 border-violet-500 cursor-move"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {selectedImage && (
                <img
                  src={selectedImage}
                  alt="Preview"
                  className="absolute select-none pointer-events-none"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                    transformOrigin: 'center',
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                  draggable={false}
                />
              )}
              <div className="absolute inset-0 border-2 border-dashed border-white/30 rounded-full pointer-events-none" />
            </div>

            <p className="text-xs text-slate-400 text-center">
              Arraste para posicionar a foto
            </p>

            <div className="flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleZoomOut}
                className="h-8 w-8"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              
              <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-violet-500 transition-all"
                  style={{ width: `${((zoom - 0.5) / 2.5) * 100}%` }}
                />
              </div>
              
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleZoomIn}
                className="h-8 w-8"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleReset}
                className="h-8 w-8 ml-2"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
              <Button type="button" variant="ghost" onClick={handleCancel}>
                <X className="w-4 h-4 mr-1" />
                Cancelar
              </Button>
              <Button 
                type="button" 
                onClick={handleConfirm}
                className="bg-violet-600 hover:bg-violet-700"
              >
                <Check className="w-4 h-4 mr-1" />
                Confirmar
              </Button>
            </div>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </DialogContent>
      </Dialog>
    </>
  );
}
