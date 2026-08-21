import { beforeEach, describe, expect, it } from "vitest";
import { useInventoryStore } from "@/store/useInventoryStore";

describe("inventory sale deduction and void restoration", () => {
  beforeEach(() => {
    useInventoryStore.setState({
      alcoholProducts: [{
        id: "spirit-1",
        name: "Whisky",
        bottleSizeMl: 750,
        currentStockMl: 750,
        minStockMl: 100,
        status: "active",
      }],
      beverageProducts: [{
        id: "beer-1",
        name: "Beer",
        packagingType: "btl",
        currentStock: 10,
        minStock: 2,
        status: "active",
      }],
      cigaretteProducts: [{
        id: "cigarette-1",
        name: "Cigarette",
        sticksPerPacket: 20,
        currentSticks: 40,
        minSticks: 10,
        status: "active",
      }],
      invMappings: [
        { id: "map-spirit", menuItemId: "mixed-order", productType: "alcohol", productId: "spirit-1", deductQty: 50 },
        { id: "map-beer", menuItemId: "mixed-order", productType: "beverage", productId: "beer-1", deductQty: 1 },
        { id: "map-cigarette", menuItemId: "mixed-order", productType: "cigarette", productId: "cigarette-1", deductQty: 2 },
      ],
      invMovements: [],
    });
  });

  it("deducts mapped stock once and restores exactly the sent item's quantities on void", () => {
    const sale = [{ menuItemId: "mixed-order", name: "Mixed sale", quantity: 2 }];

    useInventoryStore.getState().deductInventoryForSale(sale);
    expect(useInventoryStore.getState().alcoholProducts[0].currentStockMl).toBe(650);
    expect(useInventoryStore.getState().beverageProducts[0].currentStock).toBe(8);
    expect(useInventoryStore.getState().cigaretteProducts[0].currentSticks).toBe(36);
    expect(useInventoryStore.getState().invMovements).toHaveLength(3);

    useInventoryStore.getState().restoreInventoryForVoid(sale);
    expect(useInventoryStore.getState().alcoholProducts[0].currentStockMl).toBe(750);
    expect(useInventoryStore.getState().beverageProducts[0].currentStock).toBe(10);
    expect(useInventoryStore.getState().cigaretteProducts[0].currentSticks).toBe(40);
    expect(useInventoryStore.getState().invMovements).toHaveLength(6);
    expect(useInventoryStore.getState().invMovements.slice(-3).every((movement) => movement.type === "Correction")).toBe(true);
  });
});