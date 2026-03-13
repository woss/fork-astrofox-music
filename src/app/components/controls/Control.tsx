import Option from "@/app/components/controls/Option";
import useEntity from "@/app/hooks/useEntity";
import { Video } from "@/app/icons";
import type Display from "@/lib/core/Display";
import { resolve } from "@/lib/utils/object";
import { inputValueToProps } from "@/lib/utils/react";
import classNames from "classnames";
import React from "react";

interface ControlProps {
	display: Display & {
		id: string;
		displayName: string;
		properties: Record<string, unknown>;
		constructor: {
			config: {
				label: string;
				controls?: Record<string, Record<string, unknown>>;
			};
		};
	};
	className?: string;
	showHeader?: boolean;
	active?: boolean;
	onNameClick?: (id: string) => void;
	cameraModeActive?: boolean;
	onCameraModeToggle?: (id: string) => void;
}

export default function Control({
	display,
	className,
	showHeader = true,
	active = false,
	onNameClick,
	cameraModeActive = false,
	onCameraModeToggle,
}: ControlProps) {
	const {
		id,
		displayName,
		constructor: {
			config: { label, controls = {} },
		},
	} = display;

	const onChange = useEntity(display);

	function mapOption(name: string, option: Record<string, unknown>) {
		const props: Record<string, unknown> = {};

		for (const [name, value] of Object.entries(option)) {
			props[name] = resolve(value, [display]);
		}

		return (
			<Option
				key={name}
				display={display}
				name={name}
				value={(display.properties as Record<string, unknown>)[name]}
				onChange={inputValueToProps(onChange)}
				{...props}
			/>
		);
	}

	return (
		<div className={classNames("pb-2", className)}>
			{showHeader && (
				<div className={"relative py-3 px-2.5"}>
					<div
						className={
							"flex items-center justify-between text-xs text-neutral-100 overflow-hidden gap"
						}
					>
						<div className="flex items-center gap-2">
							<div
								className="inline-flex border-b-2 border-b-transparent uppercase"
								style={{
									borderBottomColor: active
										? "var(--color-primary)"
										: "transparent",
								}}
							>
								{label}
							</div>
							{display.name === "Scene" && onCameraModeToggle ? (
								<button
									type="button"
									className={classNames(
										"inline-flex h-5 w-5 items-center justify-center rounded bg-transparent text-neutral-500 transition-colors hover:text-neutral-100",
										{
											"bg-primary text-white": cameraModeActive,
											"text-neutral-500": !cameraModeActive,
										},
									)}
									onClick={() => onCameraModeToggle(id)}
								>
									<Video className="h-3.5 w-3.5" />
								</button>
							) : null}
						</div>
						<button
							type="button"
							className={classNames(
								"min-w-0 max-w-24 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap hover:text-neutral-100",
								{
									"text-neutral-100": active,
									"text-neutral-300": !active,
								},
							)}
							onClick={() => onNameClick?.(id)}
						>
							{displayName}
						</button>
					</div>
				</div>
			)}
			{Object.keys(controls).map((key) => mapOption(key, controls[key]))}
		</div>
	);
}
