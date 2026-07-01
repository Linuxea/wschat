'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import { cn, initials } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-white hover:bg-primary-hover',
        outline: 'border border-border bg-white hover:bg-panel text-text',
        ghost: 'hover:bg-black/5 text-text',
        danger: 'bg-red-500 text-white hover:bg-red-600',
        subtle: 'bg-panel hover:bg-black/5 text-text',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none transition',
        'focus:border-primary focus:ring-2 focus:ring-primary/20',
        'placeholder:text-subtext',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none transition resize-none',
        'focus:border-primary focus:ring-2 focus:ring-primary/20',
        'placeholder:text-subtext',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export function Avatar({
  src,
  name,
  size = 40,
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const colors = [
    'bg-rose-400', 'bg-orange-400', 'bg-amber-400', 'bg-lime-500',
    'bg-emerald-500', 'bg-teal-500', 'bg-sky-500', 'bg-indigo-500',
    'bg-violet-500', 'bg-fuchsia-500',
  ];
  const colorIdx = name
    ? name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length
    : 0;
  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-md flex items-center justify-center text-white font-medium', className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className={cn('h-full w-full flex items-center justify-center', colors[colorIdx])} style={{ fontSize: size * 0.4 }}>
          {initials(name)}
        </div>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />
  );
}

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-subtext">
      {icon && <div className="mb-3 text-4xl opacity-60">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-xs">{hint}</p>}
    </div>
  );
}
