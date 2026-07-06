import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("muestra el mensaje y resuelve true al aceptar", () => {
    const onClose = vi.fn();
    render(<ConfirmDialog dialog={{ message: "Eliminar pod?", resolve: () => {} }} onClose={onClose} />);
    expect(screen.getByText("Eliminar pod?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Aceptar"));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("resuelve false al cancelar", () => {
    const onClose = vi.fn();
    render(<ConfirmDialog dialog={{ message: "Eliminar pod?", resolve: () => {} }} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancelar"));
    expect(onClose).toHaveBeenCalledWith(false);
  });
});
