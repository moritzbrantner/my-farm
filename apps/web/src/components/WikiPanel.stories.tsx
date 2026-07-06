import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { WikiPanel } from "./WikiPanel";

const meta = {
  title: "Farm/WikiPanel",
  component: WikiPanel,
  args: {
    demoMode: true,
  },
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="main-menu" aria-label="Story shell">
        <div className="main-menu__panel" style={{ width: "min(92vw, 520px)" }}>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof WikiPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ScenarioIndex: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("region", { name: "Wiki pages" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: /Scenario 01: Fresh Farm/ })).toBeVisible();
    await expect(canvas.getByRole("button", { name: /Scenario 07: Blocked Work and Storage/ })).toBeVisible();
  },
};

export const PlantingWheatScenario: Story = {
  args: {
    initialScenarioId: "planting-wheat",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("heading", { name: "Planting Wheat" })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Player steps" })).toBeVisible();
    await expect(canvas.getAllByText("Resident Task Queue")[0]).toBeVisible();
    await expect(canvas.getAllByText("Item Reservation")[0]).toBeVisible();
  },
};

export const ScenarioNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: /Scenario 02: Planting Wheat/ }));
    await expect(canvas.getByRole("heading", { name: "Planting Wheat" })).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(canvas.getByRole("heading", { name: "Resident Work Queue" })).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Previous" }));
    await expect(canvas.getByRole("heading", { name: "Planting Wheat" })).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "All Scenarios" }));
    await expect(canvas.getByRole("button", { name: /Scenario 01: Fresh Farm/ })).toBeVisible();
  },
};

export const GlossaryTab: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("tab", { name: "Glossary" }));
    await expect(canvas.getByText("Demo Farm")).toBeVisible();
    await expect(canvas.getByText("Field Plot")).toBeVisible();
    await expect(canvas.getByText("Crop")).toBeVisible();
  },
};
