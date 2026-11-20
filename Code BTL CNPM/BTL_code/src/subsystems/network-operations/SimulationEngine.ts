/**
 * SimulationEngine — component của subsystem NetworkOperations.
 *
 * Cài đặt ISimulation: chạy kịch bản What-if trên trạng thái mạng lưới hiện tại
 * (không sửa dữ liệu vận hành) để nhà điều hành thấy trước Hub nào sẽ quá tải.
 */
import type { DemandProjection, ISimulation, ScenarioParams } from '@/contracts/NetworkOperations';
import type { IPersistence } from '@/contracts';
import { projectDemand } from './simulation/simulationModel';

export class SimulationEngine implements ISimulation {
  constructor(private readonly persistence: IPersistence) {}

  project(input: ScenarioParams): DemandProjection[] {
    return projectDemand(this.persistence.load().hubs, input);
  }
}
