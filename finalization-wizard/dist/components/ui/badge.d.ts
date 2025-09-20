import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const badgeVariants: (props?: {
    variant?: "outline" | "default" | "destructive" | "secondary";
} & import("class-variance-authority/types").ClassProp) => string;
declare function Badge({ className, variant, asChild, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
}): import("react/jsx-runtime").JSX.Element;
export { Badge, badgeVariants };
