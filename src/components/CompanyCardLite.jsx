import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useLivePrice } from '../context/PriceContext';
import { AnimatedPrice, AnimatedChange } from './AnimatedPrice';

export const CompanyCardLite = ({ item, index, onClick }) => {
    const [imgError, setImgError] = React.useState(false);
    const { price, change, changePct, loading, source } = useLivePrice(item.symbol);

    return (
        <div
            onClick={onClick}
            className="p-4 glass-card flex items-center justify-between group hover:border-[var(--accent-primary)]/40 transition-all duration-300 cursor-pointer"
        >
            <div className="flex items-center gap-4">
                <div className="w-9 h-9 flex items-center justify-center transition-colors">
                    {!imgError ? (
                        <img
                            src={`https://images.dhan.co/symbol/${item.symbol}.png`}
                            alt=""
                            className="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-opacity"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <div className="w-full h-full rounded-lg bg-[var(--ui-divider)] flex items-center justify-center border border-[var(--ui-divider)]">
                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">
                                {item.symbol.substring(0, 1)}
                            </span>
                        </div>
                    )}
                </div>
                <div className="space-y-1">
                    <h4 className="text-[12px] font-black tracking-[0.1em] text-[var(--text-main)] uppercase group-hover:text-[var(--accent-primary)] transition-colors">{item.name}</h4>
                    <div className="flex items-center gap-2">
                        <span className="text-[9.5px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">{item.symbol}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4">
                {/* Live CMP */}
                <div className="text-right min-w-[80px]">
                    {loading && !price ? (
                        <div className="flex flex-col items-end gap-0.5">
                            <div className="h-3 w-12 bg-[var(--ui-divider)] rounded animate-pulse" />
                            <div className="h-2 w-8 bg-[var(--ui-divider)] rounded animate-pulse mt-1" />
                        </div>
                    ) : price ? (
                        <div className="flex flex-col items-end gap-1">
                            <AnimatedPrice
                                value={price}
                                className="text-[13px] font-bold tracking-wide text-[var(--text-main)]"
                            />
                            <AnimatedChange
                                value={changePct}
                                className="text-[10px] font-bold tracking-wider"
                            />
                        </div>
                    ) : null}
                </div>

                <a
                    href={`https://www.screener.in/company/${item.symbol}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 -mr-2 text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-all"
                >
                    <ArrowUpRight className="w-3.5 h-3.5 stroke-[2px]" />
                </a>
            </div>
        </div>
    );
};
