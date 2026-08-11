import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminCrudForm } from "../AdminCrudForm";
import type { Field } from "../AdminCrudForm";
import { resetI18n } from "../../../i18n/testing";

describe("AdminCrudForm", () => {
  const user = userEvent.setup();

  afterEach(() => {
    resetI18n();
  });

  const fields: Field[] = [
    { name: "username", label: "Username", type: "text" },
    {
      name: "role",
      label: "Role",
      type: "select",
      options: [
        { value: "admin", label: "Admin" },
        { value: "operator", label: "Operator" },
      ],
    },
    { name: "email", label: "Email", type: "email", optional: true },
  ];

  it("renders fields from the fields prop", () => {
    render(
      <AdminCrudForm fields={fields} onSubmit={vi.fn()} isLoading={false} />,
    );

    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("shows a required error on empty submit", async () => {
    render(
      <AdminCrudForm fields={fields} onSubmit={vi.fn()} isLoading={false} />,
    );

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText("Username is required.")).toBeInTheDocument();
    expect(screen.getByText("Role is required.")).toBeInTheDocument();
    expect(screen.queryByText("Email is required.")).not.toBeInTheDocument();
  });

  it("clears a field error once the user types", async () => {
    render(
      <AdminCrudForm fields={fields} onSubmit={vi.fn()} isLoading={false} />,
    );

    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText("Username is required.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Username"), "nurse1");
    expect(screen.queryByText("Username is required.")).not.toBeInTheDocument();
  });

  it("calls onSubmit with the entered values", async () => {
    const onSubmit = vi.fn();
    render(<AdminCrudForm fields={fields} onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText("Username"), "nurse1");
    await user.selectOptions(screen.getByLabelText("Role"), "operator");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ username: "nurse1", role: "operator" }),
    );
  });

  it("calls onCancel when the Cancel button is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <AdminCrudForm
        fields={fields}
        onSubmit={vi.fn()}
        isLoading={false}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders the server error banner", () => {
    render(
      <AdminCrudForm
        fields={fields}
        onSubmit={vi.fn()}
        isLoading={false}
        error="409 Conflict"
      />,
    );

    expect(screen.getByText("409 Conflict")).toBeInTheDocument();
  });
});
