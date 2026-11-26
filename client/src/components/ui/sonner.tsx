import { useEffect } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-sonner-toast]")) return;
      if (!document.querySelector("[data-sonner-toast]")) return;
      toast.dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group ghp-toaster"
      position="top-center"
      richColors
      closeButton
      expand={false}
      visibleToasts={2}
      duration={2800}
      gap={10}
      offset={{ top: "max(12px, env(safe-area-inset-top))" }}
      mobileOffset={{ top: "max(10px, env(safe-area-inset-top))", left: 12, right: 12 }}
      toastOptions={{
        className: "ghp-toast",
        duration: 2800,
        classNames: {
          toast: "ghp-toast",
          title: "ghp-toast-title",
          description: "ghp-toast-description",
          closeButton: "ghp-toast-close",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--width": "min(400px, calc(100vw - 24px))",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
