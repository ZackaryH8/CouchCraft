import { useState, useEffect, useCallback } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { GameInstance } from "../types";
import { loadInstances, saveInstance, deleteInstance } from "../services/db";
import { MOCK_INSTANCES } from "../constants";

export function useInstances() {
  const [instances, setInstances] = useState<GameInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTauri()) {
      setInstances(MOCK_INSTANCES);
      setLoading(false);
      return;
    }

    loadInstances()
      .then((rows) => {
        if (rows.length === 0) {
          return Promise.all(MOCK_INSTANCES.map((inst, i) => saveInstance(inst, i))).then(
            () => MOCK_INSTANCES,
          );
        }
        return rows;
      })
      .then((rows) => {
        setInstances(rows);
        setLoading(false);
      })
      .catch(() => {
        setInstances(MOCK_INSTANCES);
        setLoading(false);
      });
  }, []);

  const createInstance = useCallback(
    async (instance: GameInstance) => {
      if (isTauri()) {
        await saveInstance(instance, instances.length).catch(console.error);
      }
      setInstances((prev) => [...prev, instance]);
    },
    [instances.length],
  );

  const updateInstance = useCallback(
    async (updated: GameInstance) => {
      if (isTauri()) {
        const index = instances.findIndex((inst) => inst.id === updated.id);
        await saveInstance(updated, index >= 0 ? index : instances.length).catch(console.error);
      }
      setInstances((prev) => prev.map((inst) => (inst.id === updated.id ? updated : inst)));
    },
    [instances],
  );

  const removeInstance = useCallback(async (id: string) => {
    if (isTauri()) {
      await deleteInstance(id).catch(console.error);
    }
    setInstances((prev) => prev.filter((inst) => inst.id !== id));
  }, []);

  return { instances, loading, createInstance, updateInstance, removeInstance };
}
