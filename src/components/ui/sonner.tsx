import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-[#16213B] group-[.toaster]:border-border/50 group-[.toaster]:shadow-[0_20px_40px_rgba(0,0,0,0.1)] group-[.toaster]:rounded-2xl group-[.toaster]:font-bold",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:font-medium",
          actionButton: "group-[.toast]:bg-[#16213B] group-[.toast]:text-white group-[.toast]:font-black uppercase tracking-widest text-[10px]",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:font-black uppercase tracking-widest text-[10px]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
