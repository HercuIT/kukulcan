// Materials and Containers configuration data
const materialsConfig = [
  {
    label: "Material Definitions",
    children: [
      {
        id: "mat-001",
        label: "M8 Screw (Steel)",
        isDraggable: true,
      },
      {
        id: "mat-002",
        label: "Polyurethane Adhesive (50ml tube)",
        isDraggable: true,
      },
      {
        id: "mat-003",
        label: "Wooden Dowel (12mm x 50mm)",
        isDraggable: true,
      },
      {
        id: "mat-004",
        label: "Acrylic Sheet (3mm thick)",
        isDraggable: true,
      },
      {
        id: "mat-005",
        label: "Aluminum Profile (20x20mm)",
        isDraggable: true,
      },
    ],
  },
  {
    label: "Container Definitions",
    children: [
      {
        id: "con-001",
        label: "Type A Pallet (1000mm x 1200mm)",
        isDraggable: true,
      },
      {
        id: "con-002",
        label: "Plastic Box (300mm x 200mm x 150mm)",
        isDraggable: true,
      },
      {
        id: "con-003",
        label: "Cardboard Box (Small)",
        isDraggable: true,
      },
      {
        id: "con-004",
        label: "Intermediate Bulk Container (IBC)",
        isDraggable: true,
      },
      {
        id: "con-005",
        label: "Metal Drum (55 Gallon)",
        isDraggable: true,
      },
    ],
  },
];

export class MaterialsNode {
  constructor(children = materialsConfig) {
    this.label = "Materials";
    this.children = children;
  }
}
