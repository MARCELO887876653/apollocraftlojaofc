import { motion } from "framer-motion";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center"
    >
      <ShoppingBag className="size-12 text-muted-foreground" />
      <h1 className="mt-4 text-5xl font-extrabold tracking-tight">404</h1>
      <p className="mt-2 text-lg text-muted-foreground">Página não encontrada</p>
      <p className="mt-1 text-sm text-muted-foreground">
        O endereço que você acessou não existe ou foi movido.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link to="/">Ir para a loja</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/loja">Ver catálogo</Link>
        </Button>
      </div>
    </motion.div>
  );
}
