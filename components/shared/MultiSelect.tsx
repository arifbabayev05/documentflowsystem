import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface Option {
    value: string;
    label: string;
}

interface MultiSelectProps {
    options: Option[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
}

export function MultiSelect({ options, selected, onChange, placeholder = "Seçim edin..." }: MultiSelectProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const handleToggle = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter(v => v !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const handleSelectAll = () => {
        if (selected.length === options.length) {
            onChange([]);
        } else {
            onChange(options.map(o => o.value));
        }
    };

    return (
        <div ref={containerRef} className="relative w-full">
            <div 
                onClick={() => setOpen(!open)} 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs cursor-pointer flex justify-between items-center text-slate-700 min-h-[36px] hover:border-slate-300 transition-colors"
            >
                <div className="truncate pr-2 font-medium">
                    {selected.length === 0 && <span className="text-slate-400">{placeholder}</span>}
                    {selected.length === 1 && options.find(o => o.value === selected[0])?.label}
                    {selected.length > 1 && selected.length < options.length && `${selected.length} seçim`}
                    {selected.length === options.length && options.length > 0 && "Bütün seçimlər"}
                </div>
                <ChevronDown size={14} className={cn("opacity-50 transition-transform duration-200", open && "rotate-180")} />
            </div>
            
            {open && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-[9999] max-h-60 overflow-y-auto py-1 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                    {options.length > 0 && (
                        <div 
                            onClick={handleSelectAll}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur z-10 shrink-0"
                        >
                            <div className={cn("flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors", 
                                selected.length === options.length ? "bg-slate-900 border-slate-900" : "bg-white border-slate-300")}>
                                {selected.length === options.length && <Check size={12} className="text-white" strokeWidth={3} />}
                            </div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Hamısını Seç</span>
                        </div>
                    )}
                    {options.map((opt) => {
                        const isSelected = selected.includes(opt.value);
                        return (
                            <div 
                                key={opt.value} 
                                onClick={() => handleToggle(opt.value)}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer h-[36px] shrink-0"
                            >
                                <div className={cn("flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors", 
                                    isSelected ? "bg-slate-900 border-slate-900" : "bg-white border-slate-300")}>
                                    {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                                </div>
                                <span className={cn("text-[12px] truncate", isSelected ? "font-semibold text-slate-900" : "text-slate-600")}>
                                    {opt.label}
                                </span>
                            </div>
                        )
                    })}
                    {options.length === 0 && (
                        <div className="px-3 py-4 text-center text-xs text-slate-400 font-medium">Seçim tapılmadı</div>
                    )}
                </div>
            )}
        </div>
    );
}
