import React from 'react';
import { cn } from './Button';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'active' | 'pending' | 'completed' | 'delayed' | 'rejected' | 'cancelled' | 'default';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const variants = {
    active: 'bg-green-100 text-success border border-green-200',
    pending: 'bg-yellow-100 text-warning border border-yellow-200',
    completed: 'bg-blue-100 text-info border border-blue-200',
    delayed: 'bg-orange-100 text-orange-700 border border-orange-200',
    rejected: 'bg-red-100 text-error border border-red-200',
    cancelled: 'bg-gray-100 text-secondary-text border border-gray-200',
    default: 'bg-soft-mint text-primary border border-light-mint',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
