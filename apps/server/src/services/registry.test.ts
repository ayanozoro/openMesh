import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DeviceRegistry, RoomManager } from "../services/registry.js";

describe("DeviceRegistry", () => {
  it("registers and retrieves devices", () => {
    const registry = new DeviceRegistry();
    const device = registry.register("socket1", "dev_1", "Test Device");

    assert.equal(device.id, "dev_1");
    assert.equal(device.name, "Test Device");
    assert.equal(device.status, "online");
    assert.equal(registry.count(), 1);
  });

  it("unregisters devices by socket", () => {
    const registry = new DeviceRegistry();
    registry.register("socket1", "dev_1", "Test Device");
    const removed = registry.unregisterBySocket("socket1");

    assert.equal(removed?.status, "offline");
    assert.equal(registry.count(), 0);
  });
});

describe("RoomManager", () => {
  it("creates and joins rooms", () => {
    const manager = new RoomManager();
    const room = manager.create("Test Room", "dev_1", "Owner");

    assert.ok(room.id.startsWith("room_"));
    assert.equal(room.members.length, 1);
    assert.equal(room.members[0].role, "owner");

    const joined = manager.join(room.id, "dev_2", "Member");
    assert.equal(joined?.members.length, 2);
  });

  it("deactivates empty rooms on leave", () => {
    const manager = new RoomManager();
    const room = manager.create("Solo Room", "dev_1", "Owner");
    manager.leave(room.id, "dev_1");

    const updated = manager.get(room.id);
    assert.equal(updated?.isActive, false);
    assert.equal(updated?.members.length, 0);
  });
});
