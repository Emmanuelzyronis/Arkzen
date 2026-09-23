import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:brightness-110",
        accent: "bg-accent text-accent-fg font-semibold hover:opacity-90",
        secondary: "border border-line bg-surface text-fg hover:bg-surface-3",
        ghost: "text-fg-soft hover:bg-surface-3 hover:text-fg",
        quiet: "border border-line bg-surface-2 text-fg-soft hover:bg-surface-3",
      },
      size: {
        sm: "h-7 px-2.5 text-[12px]",
        md: "h-8 px-3",
        lg: "h-9 px-4 text-[14px]",
        icon: "size-8",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
