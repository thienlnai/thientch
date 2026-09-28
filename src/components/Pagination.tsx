import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  itemName?: string;
  className?: string;
  showAlways?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize = 10,
  onPageChange,
  itemName = 'dòng',
  className = '',
  showAlways = false,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // If no items or only 1 page and not requested to show always, return simple summary or null
  if (totalItems === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers to show with ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show page 1
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) {
          pages.push(i);
        }
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div
      className={`px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs ${className}`}
    >
      {/* Information text */}
      <div className="text-slate-500 text-center sm:text-left font-medium">
        Hiển thị <span className="font-bold text-slate-800 font-mono">{startItem}</span> -{' '}
        <span className="font-bold text-slate-800 font-mono">{endItem}</span> trong tổng số{' '}
        <span className="font-bold text-slate-900 font-mono">{totalItems}</span> {itemName}
        <span className="text-slate-400 ml-1.5 hidden md:inline">
          (Trang <strong className="font-mono text-slate-700">{currentPage}</strong>/{totalPages})
        </span>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1 shrink-0">
          {/* First page button */}
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => onPageChange(1)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Trang đầu tiên"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>

          {/* Previous button */}
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Trang trước"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1 px-1">
            {pages.map((p, idx) => {
              if (p === '...') {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="w-7 h-7 flex items-center justify-center text-slate-400 font-bold select-none text-[11px]"
                  >
                    ...
                  </span>
                );
              }

              const pageNum = Number(p);
              const isActive = pageNum === currentPage;

              return (
                <button
                  key={`page-${pageNum}`}
                  type="button"
                  onClick={() => onPageChange(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-200/70'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          {/* Next button */}
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Trang tiếp theo"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {/* Last page button */}
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(totalPages)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Trang cuối"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
