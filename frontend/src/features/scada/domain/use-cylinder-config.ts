import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { HttpCylinderConfigRepo } from "../../../data/repos/http-cylinder-config-repo";
import type { CylinderConfig as WireCylinderConfig } from "../../../core/types";
import {
  CYLINDER_PRESSURE_TYPES,
  DEFAULT_CYLINDER_CONFIGS,
  type CylinderConfig,
  type CylinderPressureType,
} from "./cylinder-config";

const repo = new HttpCylinderConfigRepo();

const QUERY_KEY = ["scada", "cylinder-configs"] as const;

/**
 * Maps the wire shape (snake_case, includes pressure_type) from the API into
 * the render shape ({ min, max, step }) used by the SCADA cylinders.
 * Unknown/missing types fall back to the built-in defaults so the SCADA
 * never renders an empty or partial scale.
 */
function toRenderConfigs(
  wire: WireCylinderConfig[],
): Record<CylinderPressureType, CylinderConfig> {
  const result = { ...DEFAULT_CYLINDER_CONFIGS };
  for (const item of wire) {
    const type = item.pressure_type;
    if (!CYLINDER_PRESSURE_TYPES.includes(type)) continue;
    result[type] = {
      min: item.min_value,
      max: item.max_value,
      step: item.step_value,
    };
  }
  return result;
}

/**
 * DB-backed cylinder/gauge scale configuration (min/max/step per pressure
 * type), shared across all web clients.
 *
 * Public API matches the former localStorage-backed hook so SCADA components
 * keep working unchanged. Defaults are returned while loading and for any
 * type the server has not configured.
 */
export function useCylinderConfigs() {
  const queryClient = useQueryClient();

  const { data: configs = DEFAULT_CYLINDER_CONFIGS } = useQuery<
    Record<CylinderPressureType, CylinderConfig>
  >({
    queryKey: QUERY_KEY,
    queryFn: async () => toRenderConfigs(await repo.list()),
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: (input: { type: CylinderPressureType; config: CylinderConfig }) =>
      repo.update(input.type, {
        min_value: input.config.min,
        max_value: input.config.max,
        step_value: input.config.step,
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<
        Record<CylinderPressureType, CylinderConfig>
      >(QUERY_KEY);
      queryClient.setQueryData<Record<CylinderPressureType, CylinderConfig>>(
        QUERY_KEY,
        (old) => ({
          ...(old ?? DEFAULT_CYLINDER_CONFIGS),
          [input.type]: input.config,
        }),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
  });

  const updateConfig = useCallback(
    (type: CylinderPressureType, field: keyof CylinderConfig, value: number) => {
      const current =
        queryClient.getQueryData<Record<CylinderPressureType, CylinderConfig>>(
          QUERY_KEY,
        )?.[type] ?? DEFAULT_CYLINDER_CONFIGS[type];
      const updated = { ...current, [field]: value };
      updateMutation.mutate({ type, config: updated });
    },
    [queryClient, updateMutation],
  );

  const resetMutation = useMutation({
    mutationFn: () => repo.reset(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const resetConfigs = useCallback(() => {
    resetMutation.mutate();
  }, [resetMutation]);

  return { configs, updateConfig, resetConfigs };
}
