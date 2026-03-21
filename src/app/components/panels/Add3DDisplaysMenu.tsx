import SectionAddMenu from "./SectionAddMenu";

const DISPLAY_3D_CATEGORIES = [
	{
		label: "3D",
		items: ["Geometry", "Tunnel", "Cubes", "Mesh Grid"],
	},
];

interface Add3DDisplaysMenuProps {
	sceneId: string;
}

export default function Add3DDisplaysMenu({ sceneId }: Add3DDisplaysMenuProps) {
	return (
		<SectionAddMenu
			sceneId={sceneId}
			entityType="displays"
			categories={DISPLAY_3D_CATEGORIES}
			ariaLabel="Add 3D display"
		/>
	);
}
