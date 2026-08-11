import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable } from "../DataTable";
import type { Column } from "../DataTable";
import { resetI18n } from "../../../i18n/testing";

interface TestRow {
  id: number;
  name: string;
  email: string | null;
}

const columns: Column<TestRow>[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
];

const data: TestRow[] = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: null },
];

describe("DataTable", () => {
  const user = userEvent.setup();

  afterEach(() => {
    resetI18n();
  });

  it("renders rows with default cell rendering", () => {
    render(
      <DataTable<TestRow>
        columns={columns}
        data={data}
        keyExtractor={(r) => r.id}
      />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders custom render for a column", () => {
    const customColumns: Column<TestRow>[] = [
      { key: "name", label: "Name" },
      {
        key: "email",
        label: "Email",
        render: (r) => <span data-testid={`email-${r.id}`}>{r.email ?? "no email"}</span>,
      },
    ];

    render(
      <DataTable<TestRow>
        columns={customColumns}
        data={data}
        keyExtractor={(r) => r.id}
      />,
    );

    expect(screen.getByTestId("email-1")).toHaveTextContent("alice@example.com");
    expect(screen.getByTestId("email-2")).toHaveTextContent("no email");
  });

  it("shows empty state with message and default icon", () => {
    render(
      <DataTable<TestRow>
        columns={columns}
        data={[]}
        keyExtractor={(r) => r.id}
        emptyMessage="No items found"
        emptyHint="Try adjusting your search"
      />,
    );

    expect(screen.getByText("No items found")).toBeInTheDocument();
    expect(screen.getByText("Try adjusting your search")).toBeInTheDocument();
  });

  it("shows empty state with custom icon", () => {
    const customIcon = <div data-testid="custom-empty-icon">Custom</div>;

    render(
      <DataTable<TestRow>
        columns={columns}
        data={[]}
        keyExtractor={(r) => r.id}
        emptyMessage="Nothing here"
        emptyIcon={customIcon}
      />,
    );

    expect(screen.getByTestId("custom-empty-icon")).toBeInTheDocument();
  });

  it("shows loading skeleton when isLoading is true", () => {
    render(
      <DataTable<TestRow>
        columns={columns}
        data={data}
        keyExtractor={(r) => r.id}
        isLoading={true}
      />,
    );

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("calls onEdit when edit button is clicked", async () => {
    const onEdit = vi.fn();

    render(
      <DataTable<TestRow>
        columns={columns}
        data={data}
        keyExtractor={(r) => r.id}
        onEdit={onEdit}
      />,
    );

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await user.click(editButtons[0]!);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(data[0]);
  });

  it("calls onDelete when delete button is clicked", async () => {
    const onDelete = vi.fn();

    render(
      <DataTable<TestRow>
        columns={columns}
        data={data}
        keyExtractor={(r) => r.id}
        onDelete={onDelete}
      />,
    );

    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    await user.click(deleteButtons[0]!);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(data[0]);
  });

  it("renders pagination controls when pageSize is set", () => {
    const manyRows = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
    }));

    render(
      <DataTable<TestRow>
        columns={columns}
        data={manyRows}
        keyExtractor={(r) => r.id}
        pageSize={10}
      />,
    );

    expect(screen.getAllByText("Name")).toHaveLength(1);
    expect(screen.getByText("User 1")).toBeInTheDocument();
    expect(screen.queryByText("User 25")).not.toBeInTheDocument();
  });

  it("does not render pagination controls when pageSize is not set", () => {
    render(
      <DataTable<TestRow>
        columns={columns}
        data={data}
        keyExtractor={(r) => r.id}
      />,
    );

    expect(screen.queryByRole("button", { name: /rows per page/i })).not.toBeInTheDocument();
  });
});
