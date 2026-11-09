import test from 'node:test';
import assert from 'node:assert/strict';
import {runDatasetJourney,type DatasetDriverOptions} from '../lib/evaluation-observability/dataset-driver';

test('live dataset rejects holdouts and unbounded limits before database or provider access',async()=>{
 const base={mode:'live-exploratory',caseId:'D01',budgetMicros:2_000_000,worker:{runLimitMicros:2_000_000,maxCalls:24,timeoutMs:180_000},database:{query(){throw Error('database touched');}}} as unknown as DatasetDriverOptions;
 await assert.rejects(runDatasetJourney({...base,caseId:'H01'}),/not allowlisted/);
 for(const worker of [{...base.worker,maxCalls:25},{...base.worker,timeoutMs:NaN},{...base.worker,runLimitMicros:0},{...base.worker,runLimitMicros:2_000_001}])await assert.rejects(runDatasetJourney({...base,worker}),/Bounded live/);
 await assert.rejects(runDatasetJourney({...base,budgetMicros:2_000_001}),/Bounded live/);
 await assert.rejects(runDatasetJourney({...base,mode:'live' as any}),/Explicit evaluation mode/);
});
