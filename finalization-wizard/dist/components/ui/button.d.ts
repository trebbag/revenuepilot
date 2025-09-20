import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const buttonVariants: (props?: {
    variant?: "link" | "outline" | "default" | "destructive" | "secondary" | "ghost";
    size?: "default" | "sm" | "lg" | "icon";
} & import("class-variance-authority/types").ClassProp) => string;
declare function Button({ className, variant, size, asChild, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
}): import("react/jsx-runtime").JSX.Element;
export { Button, buttonVariants };
