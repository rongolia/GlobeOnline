import React, { useEffect, useRef, useState } from 'react';
import { EarthScene } from '../scene/EarthScene';
import { CountryInfo } from '../utils/geo';

export const EarthGlobe: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<EarthScene | null>(null);

  const [hoveredCountry, setHoveredCountry] = useState<CountryInfo | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new EarthScene({
      container: mountRef.current,
      onCountryHover: (country, screenPos) => {
        setHoveredCountry(country);
        setTooltipPos(screenPos);
      },
    });
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-[#0a0e17] select-none touch-none"
      onPointerDown={() => setIsInteracting(true)}
      onPointerUp={() => setIsInteracting(false)}
      onPointerLeave={() => setIsInteracting(false)}
    >
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing outline-none"
      />

      {/* Minimal Header Badge */}
      <div className="absolute top-6 left-6 pointer-events-none transition-opacity duration-300">
        <div className="flex items-center space-x-3 bg-slate-900/80 border border-slate-700/60 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-xl shadow-black/40">
          <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-emerald-300/40" />
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-widest font-semibold text-slate-200">
              Low-Poly Earth
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              Interactive 3D Atlas
            </span>
          </div>
        </div>
      </div>

      {/* Floating Hover Country Tooltip */}
      {hoveredCountry && tooltipPos && !isInteracting && (
        <div
          className="fixed pointer-events-none z-50 transform -translate-x-1/2 -translate-y-full pb-3 transition-opacity duration-150"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
          }}
        >
          <div className="flex items-center space-x-2 bg-slate-900/90 border border-slate-700/80 backdrop-blur-sm px-3.5 py-1.5 rounded-xl shadow-2xl text-slate-100 animate-in fade-in zoom-in-95">
            <span
              className="w-2.5 h-2.5 rounded-full ring-1 ring-white/30"
              style={{ backgroundColor: hoveredCountry.color }}
            />
            <span className="text-xs font-semibold tracking-wide">
              {hoveredCountry.name}
            </span>
          </div>
        </div>
      )}

      {/* Gentle interaction hint at bottom */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="bg-slate-900/60 border border-slate-800/70 px-4 py-1.5 rounded-full backdrop-blur-sm text-[11px] font-medium text-slate-400 tracking-wide">
          Drag to spin freely · Scroll or pinch to zoom
        </div>
      </div>
    </div>
  );
};
