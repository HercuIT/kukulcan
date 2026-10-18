export class EquipmentNode {
  constructor() {
    this.label = "Equipment";
    this.children = [
      {
        label: "Enterprise Node",
        children: [
          {
            id: "eq-001",
            label: "Laser Cutter-01",
            isDraggable: true,
            details: {
              capacity: "0.1mm precision",
              lastMaintenance: "2025-09-01",
              manufacturerModel: "LaserCut Precision X",
              status: "Online",
            },
          },
          {
            id: "eq-002",
            label: "Hydraulic Press-02",
            isDraggable: true,
            details: {
              capacity: "50 Tons",
              lastMaintenance: "2025-08-20",
              manufacturerModel: "PressMaster 50T",
              status: "Online",
            },
          },
          {
            id: "eq-003",
            label: "Conveyor Belt-03",
            isDraggable: true,
            details: {
              capacity: "5 meters/second",
              lastMaintenance: "2025-09-10",
              manufacturerModel: "MoveIt-Fast 3000",
              status: "Stopped",
            },
          },
          {
            id: "eq-004",
            label: "Packaging Robot-04",
            isDraggable: true,
            details: {
              capacity: "30 boxes/minute",
              lastMaintenance: "2025-07-15",
              manufacturerModel: "Pack-o-Matic 900",
              status: "Online",
            },
          },
        ],
      },
    ];
  }
}
