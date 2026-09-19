import test from "node:test";
import assert from "node:assert/strict";

import { evaluateDiagnosis, getStepsForGasCategory } from "../src/kouatsu/js/diagnosis.js";

const evaluate = (action, category, answers) => evaluateDiagnosis(action, category, answers);
const labels = (result) => (result.procedures || []).map((procedure) => procedure.label).join(" ");

test("冷凍三分類は50/20、50/5、20/3の境界を維持する", () => {
  const type1 = getStepsForGasCategory("manufacture", "refrigeration", { gasType: "type1" });
  const fluorocarbon = getStepsForGasCategory("manufacture", "refrigeration", {
    gasType: "fluorocarbon_ammonia",
  });
  const other = getStepsForGasCategory("manufacture", "refrigeration", { gasType: "other" });

  assert.deepEqual(type1[1].options.map((option) => option.label), [
    "50 トン/日 以上",
    "20 トン/日 以上 50 トン/日 未満",
    "20 トン/日 未満",
  ]);
  assert.deepEqual(fluorocarbon[1].options.map((option) => option.label), [
    "50 トン/日 以上",
    "5 トン/日 以上 50 トン/日 未満",
    "5 トン/日 未満",
  ]);
  assert.deepEqual(other[1].options.map((option) => option.label), [
    "20 トン/日 以上",
    "3 トン/日 以上 20 トン/日 未満",
    "3 トン/日 未満",
  ]);

  assert.equal(evaluate("manufacture", "refrigeration", { gasType: "type1", capacityBand: "over" }).verdict, "permit");
  assert.equal(evaluate("manufacture", "refrigeration", { gasType: "type1", capacityBand: "between" }).verdict, "notification");
  assert.equal(evaluate("manufacture", "refrigeration", { gasType: "fluorocarbon_ammonia", capacityBand: "between" }).verdict, "notification");
  assert.equal(evaluate("manufacture", "refrigeration", { gasType: "other", capacityBand: "under" }).verdict, "none");
});

test("冷凍の第二種製造届出は製造開始日の20日前で、危害予防規程を付けない", () => {
  const result = evaluate("manufacture", "refrigeration", { gasType: "other", capacityBand: "between" });
  assert.equal(result.verdict, "notification");
  assert.match(labels(result), /製造開始の日の20日前まで/);
  assert.doesNotMatch(labels(result), /危害予防規程/);
});

test("一般則・液石則の第二種製造と混合境界を判定する", () => {
  assert.equal(
    evaluate("manufacture", "general", { gasScope: "type1only", capacityBand: "under", isBusiness: "yes" }).verdict,
    "notification"
  );
  assert.equal(
    evaluate("manufacture", "general", { gasScope: "mixed", s1: "150", s2: "50", isBusiness: "yes" }).verdict,
    "permit"
  );
  assert.equal(
    evaluate("manufacture", "general", { gasScope: "mixed", s1: "150", s2: "49", isBusiness: "yes" }).verdict,
    "notification"
  );
  assert.equal(
    evaluate("manufacture", "lpgas", {
      lpgasConsumerSupply: "no",
      capacityBand: "under",
      isBusiness: "yes",
    }).verdict,
    "notification"
  );

  for (const category of ["general", "refrigeration", "lpgas"]) {
    const result =
      category === "general"
        ? evaluate("manufacture", category, { gasScope: "otherOnly", capacityBand: "under", isBusiness: "yes" })
        : category === "refrigeration"
          ? evaluate("manufacture", category, { gasType: "other", capacityBand: "between" })
        : evaluate("manufacture", category, { lpgasConsumerSupply: "no", capacityBand: "under", isBusiness: "yes" });
    assert.doesNotMatch(labels(result), /危害予防規程/);
  }

  const consumerSupply = evaluate("manufacture", "lpgas", { lpgasConsumerSupply: "yes" });
  assert.equal(consumerSupply.verdict, "other_law");
  const consumerSupplyUnknown = evaluate("manufacture", "lpgas", { lpgasConsumerSupply: "unknown" });
  assert.equal(consumerSupplyUnknown.verdict, "invalid");
});

test("販売は少量例外、第一種製造者例外、冷凍区分を分ける", () => {
  const selfSale = evaluate("sales", "general", { smallSalesException: "no", selfSale: "yes" });
  assert.equal(selfSale.verdict, "none");
  assert.match(selfSale.summary, /第一種製造者/);

  const small = evaluate("sales", "general", { smallSalesException: "yes" });
  assert.equal(small.verdict, "none");
  assert.match(small.summary, /5立方メートル未満/);

  const smallStep = getStepsForGasCategory("sales", "general", {}).find((step) => step.id === "smallSalesException");
  assert.match(smallStep.help, /医療用/);
  assert.match(smallStep.help, /300mL/);
  assert.match(smallStep.help, /消火器/);
  assert.match(smallStep.help, /1\.2L/);
  assert.match(smallStep.help, /自動車/);
  assert.match(smallStep.help, /緩衝装置/);

  const regularSales = evaluate("sales", "general", { smallSalesException: "no", selfSale: "no" });
  assert.equal(regularSales.verdict, "notification");
  assert.doesNotMatch(regularSales.note, /医療用/);
  assert.doesNotMatch(regularSales.note, /第20条の4第2号/);

  const refrigeration = evaluate("sales", "refrigeration", { smallSalesException: "no" });
  assert.equal(refrigeration.verdict, "notification");
  assert.match(refrigeration.summary, /20日前/);

  const lpgasConsumer = evaluate("sales", "lpgas", { lpgasConsumer: "yes" });
  assert.equal(lpgasConsumer.verdict, "other_law");
  assert.match(lpgasConsumer.summary, /一般消費者/);

  const lpgasConsumerUnknown = evaluate("sales", "lpgas", {
    lpgasConsumer: "unknown",
    smallSalesException: "yes",
  });
  assert.equal(lpgasConsumerUnknown.verdict, "invalid");
});

test("販売届出の不明条件は不要と判定しない", () => {
  const result = evaluate("sales", "general", { smallSalesException: "unknown" });
  assert.equal(result.verdict, "invalid");
  assert.ok(Array.isArray(result.citations));
  assert.ok(Array.isArray(result.procedures));
  assert.ok(result.title);
  assert.ok(result.summary);
});

test("貯蔵の適用除外・分類・少量例外を境界確認する", () => {
  assert.equal(evaluate("storage", "general", { selfManufactureStorage: "yes" }).verdict, "none");
  assert.equal(
    evaluate("storage", "general", {
      selfManufactureStorage: "no",
      storageGasScope: "type1only",
      storageThirdGas: "no",
      storageCapacityBand: "over",
    }).verdict,
    "permit"
  );
  assert.equal(
    evaluate("storage", "general", {
      selfManufactureStorage: "no",
      storageGasScope: "otherOnly",
      storageThirdGas: "no",
      storageCapacityBand: "between",
    }).verdict,
    "notification"
  );
  assert.equal(
    evaluate("storage", "general", {
      selfManufactureStorage: "no",
      storageGasScope: "mixed",
      storageThirdGas: "no",
      storageM: "1500",
      storageS2: "500",
    }).verdict,
    "permit"
  );
  assert.equal(
    evaluate("storage", "general", {
      selfManufactureStorage: "no",
      storageGasScope: "mixed",
      storageThirdGas: "no",
      storageM: "1500",
      storageS2: "499",
    }).verdict,
    "notification"
  );
  const small = evaluate("storage", "general", {
    selfManufactureStorage: "no",
    storageGasScope: "otherOnly",
    storageThirdGas: "no",
    storageCapacityBand: "under",
  });
  assert.equal(small.verdict, "none");
  assert.match(small.note, /0\.15立方メートル/);
  assert.match(small.note, /1\.5キログラム相当/);

  const lpgasSmall = evaluate("storage", "lpgas", {
    selfManufactureStorage: "no",
    lpgasSupply: "no",
    storageCapacityBand: "under",
  });
  assert.equal(lpgasSmall.verdict, "none");
  assert.match(lpgasSmall.note, /1\.5キログラム相当/);
});

test("第三種ガスを含む貯蔵とLPガス法上の貯蔵は安全側に分ける", () => {
  const special = evaluate("storage", "general", {
    selfManufactureStorage: "no",
    storageGasScope: "otherOnly",
    storageThirdGas: "yes",
  });
  assert.equal(special.verdict, "invalid");
  assert.match(special.summary, /第三種ガス/);

  const lpgasSupply = evaluate("storage", "lpgas", {
    selfManufactureStorage: "no",
    lpgasSupply: "yes",
  });
  assert.equal(lpgasSupply.verdict, "other_law");
});

test("消費の特殊7ガスは容器利用だけでも除外せず、校正試験だけを例外にする", () => {
  const containerUse = evaluate("consumption", "general", {
    consumptionGasType: "special7",
    special7CalibrationOnly: "no",
  });
  assert.equal(containerUse.verdict, "notification");
  assert.match(containerUse.note, /容器からの消費/);

  const calibration = evaluate("consumption", "general", {
    consumptionGasType: "special7",
    special7CalibrationOnly: "yes",
  });
  assert.equal(calibration.verdict, "none");

  const unknownPurpose = evaluate("consumption", "general", {
    consumptionGasType: "special7",
    special7CalibrationOnly: "unknown",
  });
  assert.equal(unknownPurpose.verdict, "invalid");
});

test("消費LPガスの3000kg/10000kg特例と導管供給を判定する", () => {
  const ordinaryBoundary = evaluate("consumption", "lpgas", {
    lpgasConsumer: "no",
    consumptionPipeline: "no",
    lpgasLargeConsumer: "no",
    consumptionStorageBand: "over",
  });
  assert.equal(ordinaryBoundary.verdict, "notification");
  assert.match(ordinaryBoundary.summary, /20日前/);

  const largeUnder = evaluate("consumption", "lpgas", {
    lpgasConsumer: "no",
    consumptionPipeline: "no",
    lpgasLargeConsumer: "yes",
    consumptionStorageBand: "under",
  });
  assert.equal(largeUnder.verdict, "none");
  assert.match(largeUnder.note, /1万キログラム未満/);

  const largeBoundary = evaluate("consumption", "lpgas", {
    lpgasConsumer: "no",
    consumptionPipeline: "no",
    lpgasLargeConsumer: "yes",
    consumptionStorageBand: "over",
  });
  assert.equal(largeBoundary.verdict, "notification");
  assert.match(largeBoundary.note, /1万キログラム/);

  const pipeline = evaluate("consumption", "lpgas", {
    lpgasConsumer: "no",
    consumptionPipeline: "yes",
  });
  assert.equal(pipeline.verdict, "notification");

  const consumerUnknown = evaluate("consumption", "lpgas", {
    lpgasConsumer: "unknown",
    consumptionPipeline: "no",
    lpgasLargeConsumer: "no",
    consumptionStorageBand: "under",
  });
  assert.equal(consumerUnknown.verdict, "invalid");
});

test("未回答・未知値・数値空欄はinvalidとして安全な結果形を返す", () => {
  const missing = evaluate("manufacture", "general", {
    gasScope: "mixed",
    s1: "",
    s2: "10",
    isBusiness: "yes",
  });
  assert.equal(missing.verdict, "invalid");
  assert.ok(Array.isArray(missing.citations));
  assert.ok(Array.isArray(missing.procedures));
  assert.ok(missing.title);
  assert.ok(missing.summary);

  const unknown = evaluate("manufacture", "general", {
    gasScope: "otherOnly",
    capacityBand: "unknown",
    isBusiness: "no",
  });
  assert.equal(unknown.verdict, "invalid");

  assert.doesNotThrow(() => getStepsForGasCategory("sales", "general", null));
  assert.equal(evaluate("unknown-action", "unknown-category", {}).verdict, "invalid");
});
