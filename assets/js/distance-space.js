/*
 * Distance Space
 * A dependency-free, reusable visualization for DistClassiPy and DiMMAD.
 *
 * The full experience is mounted with:
 *   <div data-distance-space="full"></div>
 *
 * The small, autoplaying homepage version is mounted with:
 *   <span data-distance-space="compact"></span>
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const EPSILON = Number.EPSILON;
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

  const FEATURE_NAMES = [
    "rise time",
    "fade rate",
    "color",
    "amplitude",
    "asymmetry",
    "duration",
  ];

  const CLASS_META = [
    { id: "ia", name: "SN Ia", color: "#fe6100", shape: "circle" },
    { id: "ii", name: "SN II", color: "#785ef0", shape: "triangle" },
    { id: "ibc", name: "SN Ibc", color: "#dc267f", shape: "square" },
    { id: "novel", name: "TDE anomaly", color: "#ffb000", shape: "star" },
  ];

  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const square = (value) => value * value;

  function vectorDistance(fn) {
    return function (a, b) {
      const value = fn(a, b);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    };
  }

  const METRICS = [
    {
      id: "euclidean",
      name: "Euclidean",
      formula: "√ Σ Δᵢ²",
      note: "Straight-line distance weighs every feature on one familiar scale.",
      emphasis: "absolute separation",
      color: "#66e3ff",
      distance: vectorDistance((a, b) =>
        Math.sqrt(sum(a.map((value, index) => square(value - b[index]))))
      ),
    },
    {
      id: "braycurtis",
      name: "Bray–Curtis",
      formula: "Σ|Δᵢ| / Σ(xᵢ + yᵢ)",
      note: "Compares total difference relative to the combined feature mass.",
      emphasis: "composition",
      color: "#7de2b8",
      distance: vectorDistance((a, b) => {
        const numerator = sum(a.map((value, index) => Math.abs(value - b[index])));
        const denominator = sum(a.map((value, index) => Math.abs(value + b[index])));
        return denominator > EPSILON ? numerator / denominator : 0;
      }),
    },
    {
      id: "canberra",
      name: "Canberra",
      formula: "Σ |Δᵢ| / (|xᵢ| + |yᵢ|)",
      note: "Small-valued features speak louder because each difference is locally scaled.",
      emphasis: "relative change",
      color: "#ffd166",
      distance: vectorDistance((a, b) =>
        sum(
          a.map((value, index) => {
            const denominator = Math.abs(value) + Math.abs(b[index]);
            return denominator > EPSILON ? Math.abs(value - b[index]) / denominator : 0;
          })
        )
      ),
    },
    {
      id: "cityblock",
      name: "Cityblock",
      formula: "Σ |Δᵢ|",
      note: "Differences accumulate feature by feature—the geometry of a grid.",
      emphasis: "total displacement",
      color: "#79c7ff",
      distance: vectorDistance((a, b) =>
        sum(a.map((value, index) => Math.abs(value - b[index])))
      ),
    },
    {
      id: "chebyshev",
      name: "Chebyshev",
      formula: "max |Δᵢ|",
      note: "Only the single largest feature mismatch sets the distance.",
      emphasis: "largest mismatch",
      color: "#a98cff",
      distance: vectorDistance((a, b) =>
        Math.max(...a.map((value, index) => Math.abs(value - b[index])))
      ),
    },
    {
      id: "clark",
      name: "Clark",
      formula: "√ Σ (|Δᵢ| / (xᵢ + yᵢ))²",
      note: "A quadratic relative distance that strongly reshapes low-valued features.",
      emphasis: "relative extremes",
      color: "#f08bd2",
      distance: vectorDistance((a, b) =>
        Math.sqrt(
          sum(
            a.map((value, index) => {
              const denominator = value + b[index];
              return denominator > EPSILON
                ? square(Math.abs(value - b[index]) / denominator)
                : 0;
            })
          )
        )
      ),
    },
    {
      id: "correlation",
      name: "Correlation",
      formula: "1 − corr(x, y)",
      note: "Feature pattern matters; a shared offset and overall scale largely disappear.",
      emphasis: "pattern",
      color: "#69dfc7",
      distance: vectorDistance((a, b) => {
        const meanA = sum(a) / a.length;
        const meanB = sum(b) / b.length;
        const centeredA = a.map((value) => value - meanA);
        const centeredB = b.map((value) => value - meanB);
        const numerator = sum(centeredA.map((value, index) => value * centeredB[index]));
        const denominator = Math.sqrt(
          sum(centeredA.map(square)) * sum(centeredB.map(square))
        );
        return denominator > EPSILON ? 1 - numerator / denominator : 0;
      }),
    },
    {
      id: "cosine",
      name: "Cosine",
      formula: "1 − (x · y) / (‖x‖ ‖y‖)",
      note: "Direction matters more than magnitude: similarly shaped vectors pull together.",
      emphasis: "orientation",
      color: "#ff8c69",
      distance: vectorDistance((a, b) => {
        const dot = sum(a.map((value, index) => value * b[index]));
        const denominator = Math.sqrt(sum(a.map(square)) * sum(b.map(square)));
        return denominator > EPSILON ? 1 - dot / denominator : 0;
      }),
    },
    {
      id: "hellinger",
      name: "Hellinger",
      formula: "√(2 Σ(√xᵢ − √yᵢ)²)",
      note: "Square roots soften large features and expose changes in smaller components.",
      emphasis: "distribution shape",
      color: "#5ee0a0",
      distance: vectorDistance((a, b) =>
        Math.sqrt(
          2 * sum(a.map((value, index) => square(Math.sqrt(value) - Math.sqrt(b[index]))))
        )
      ),
    },
    {
      id: "jaccard",
      name: "Jaccard",
      formula: "1 − (x · y) / (‖x‖² + ‖y‖² − x · y)",
      note: "Shared signal is judged against the total signal present in either object.",
      emphasis: "shared support",
      color: "#56cfe1",
      distance: vectorDistance((a, b) => {
        const dot = sum(a.map((value, index) => value * b[index]));
        const denominator = sum(a.map(square)) + sum(b.map(square)) - dot;
        return denominator > EPSILON ? 1 - dot / denominator : 0;
      }),
    },
    {
      id: "lorentzian",
      name: "Lorentzian",
      formula: "Σ log(1 + |Δᵢ|)",
      note: "Log compression prevents one very large mismatch from dominating the rest.",
      emphasis: "robust difference",
      color: "#ff7aa2",
      distance: vectorDistance((a, b) =>
        sum(a.map((value, index) => Math.log1p(Math.abs(value - b[index]))))
      ),
    },
    {
      id: "meehl",
      name: "Meehl",
      formula: "Σ(Δᵢ − Δᵢ₊₁)²",
      note: "Adjacent feature differences matter, revealing changes in vector shape.",
      emphasis: "local structure",
      color: "#b6a2ff",
      distance: vectorDistance((a, b) => {
        let total = 0;
        for (let index = 0; index < a.length - 1; index += 1) {
          total += square((a[index] - b[index]) - (a[index + 1] - b[index + 1]));
        }
        return total;
      }),
    },
    {
      id: "motyka",
      name: "Motyka",
      formula: "Σ max(xᵢ, yᵢ) / Σ(xᵢ + yᵢ)",
      note: "Dominant components define the geometry through a normalized overlap ratio.",
      emphasis: "dominant overlap",
      color: "#f6bd60",
      distance: vectorDistance((a, b) => {
        const numerator = sum(a.map((value, index) => Math.max(value, b[index])));
        const denominator = sum(a.map((value, index) => value + b[index]));
        return denominator > EPSILON ? numerator / denominator : 0;
      }),
    },
    {
      id: "soergel",
      name: "Soergel",
      formula: "Σ|Δᵢ| / Σ max(xᵢ, yᵢ)",
      note: "Absolute difference is scaled by the strongest component in either object.",
      emphasis: "relative mismatch",
      color: "#77d6b6",
      distance: vectorDistance((a, b) => {
        const numerator = sum(a.map((value, index) => Math.abs(value - b[index])));
        const denominator = sum(a.map((value, index) => Math.max(value, b[index])));
        return denominator > EPSILON ? numerator / denominator : 0;
      }),
    },
    {
      id: "wave_hedges",
      name: "Wave Hedges",
      formula: "Σ |Δᵢ| / max(xᵢ, yᵢ)",
      note: "Every feature casts an equal relative vote, whatever its absolute scale.",
      emphasis: "per-feature contrast",
      color: "#84b6f4",
      distance: vectorDistance((a, b) =>
        sum(
          a.map((value, index) => {
            const denominator = Math.max(value, b[index]);
            return denominator > EPSILON ? Math.abs(value - b[index]) / denominator : 0;
          })
        )
      ),
    },
    {
      id: "kulczynski",
      name: "Kulczynski",
      formula: "Σ|Δᵢ| / Σ min(xᵢ, yᵢ)",
      note: "Differences expand when the two objects share little common signal.",
      emphasis: "scarce overlap",
      color: "#e98aef",
      distance: vectorDistance((a, b) => {
        const numerator = sum(a.map((value, index) => Math.abs(value - b[index])));
        const denominator = sum(a.map((value, index) => Math.min(value, b[index])));
        return denominator > EPSILON ? numerator / denominator : 0;
      }),
    },
  ];

  const METRIC_BY_ID = Object.fromEntries(METRICS.map((metric) => [metric.id, metric]));
  const TOUR_IDS = [
    "euclidean",
    "cityblock",
    "cosine",
    "chebyshev",
    "canberra",
    "hellinger",
    "lorentzian",
    "kulczynski",
  ];

  function mulberry32(seed) {
    return function () {
      let value = (seed += 0x6d2b79f5);
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(random) {
    const u = Math.max(random(), 1e-8);
    const v = Math.max(random(), 1e-8);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  function buildDataset() {
    const random = mulberry32(240312120);
    const definitions = [
      {
        center: [0.44, 0.27, 0.36, 0.82, 0.38, 0.57],
        spread: [0.075, 0.055, 0.07, 0.065, 0.07, 0.065],
      },
      {
        center: [0.72, 0.54, 0.67, 0.57, 0.78, 0.84],
        spread: [0.08, 0.075, 0.065, 0.07, 0.055, 0.06],
      },
      {
        center: [0.28, 0.69, 0.75, 0.67, 0.57, 0.32],
        spread: [0.06, 0.07, 0.07, 0.055, 0.075, 0.055],
      },
    ];
    const points = [];

    definitions.forEach((definition, classIndex) => {
      for (let objectIndex = 0; objectIndex < 12; objectIndex += 1) {
        const sharedShift = gaussian(random) * 0.025;
        const features = definition.center.map((center, featureIndex) => {
          const directionShift = featureIndex % 2 === 0 ? sharedShift : -sharedShift * 0.6;
          return clamp(
            center + gaussian(random) * definition.spread[featureIndex] + directionShift,
            0.045,
            0.97
          );
        });
        points.push({
          name: `${CLASS_META[classIndex].name} ${String(objectIndex + 1).padStart(2, "0")}`,
          classIndex,
          kind: "object",
          features,
        });
      }
    });

    [
      {
        name: "Fast blue transient",
        features: [0.08, 0.94, 0.13, 0.91, 0.18, 0.09],
      },
      {
        name: "Slow red transient",
        features: [0.94, 0.13, 0.92, 0.74, 0.91, 0.97],
      },
      {
        name: "Boundary transient",
        features: [0.48, 0.48, 0.53, 0.69, 0.53, 0.49],
      },
    ].forEach((candidate) => {
      points.push({ ...candidate, classIndex: 3, kind: "candidate" });
    });

    const centroidIndices = [];
    definitions.forEach((definition, classIndex) => {
      const members = points.filter(
        (point) => point.kind === "object" && point.classIndex === classIndex
      );
      const features = FEATURE_NAMES.map((_, featureIndex) =>
        sum(members.map((point) => point.features[featureIndex])) / members.length
      );
      centroidIndices.push(points.length);
      points.push({
        name: `${CLASS_META[classIndex].name} prototype`,
        classIndex,
        kind: "centroid",
        features,
      });
    });

    return {
      points,
      centroidIndices,
      objectIndices: points
        .map((point, index) => (point.kind === "centroid" ? -1 : index))
        .filter((index) => index >= 0),
      knownObjectIndices: points
        .map((point, index) => (point.kind === "object" ? index : -1))
        .filter((index) => index >= 0),
      candidateIndices: points
        .map((point, index) => (point.kind === "candidate" ? index : -1))
        .filter((index) => index >= 0),
    };
  }

  function buildDatasetFromFink(sample) {
    const points = sample.objects.map((object) => ({
      ...object,
      name: object.id,
      classIndex: object.kind === "candidate"
        ? 3
        : ["SN Ia", "SN II", "SN Ibc"].indexOf(object.className),
      kind: object.kind || "object",
      features: object.features,
    }));
    const knownObjectIndices = points
      .map((point, index) => point.kind === "object" ? index : -1)
      .filter((index) => index >= 0);
    const candidateIndices = points
      .map((point, index) => point.kind === "candidate" ? index : -1)
      .filter((index) => index >= 0);
    const centroidIndices = [];
    for (let classIndex = 0; classIndex < 3; classIndex += 1) {
      const members = points.filter((point) => point.kind === "object" && point.classIndex === classIndex);
      const features = members[0].features.map((_, featureIndex) =>
        sum(members.map((point) => point.features[featureIndex])) / members.length
      );
      centroidIndices.push(points.length);
      points.push({
        name: `${CLASS_META[classIndex].name} prototype`,
        classIndex,
        className: CLASS_META[classIndex].name,
        tnsType: CLASS_META[classIndex].name,
        detections: null,
        kind: "centroid",
        raw: members[0].raw?.map((_, featureIndex) =>
          sum(members.map((point) => point.raw[featureIndex])) / members.length
        ),
        features,
        physics: null,
        lightCurve: [],
      });
    }
    return {
      points,
      centroidIndices,
      objectIndices: knownObjectIndices.concat(candidateIndices),
      knownObjectIndices,
      candidateIndices,
    };
  }

  function median(values) {
    if (!values.length) return 0;
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2
      ? ordered[middle]
      : (ordered[middle - 1] + ordered[middle]) / 2;
  }

  function quantile(values, fraction) {
    if (!values.length) return 0;
    const ordered = [...values].sort((a, b) => a - b);
    const position = (ordered.length - 1) * fraction;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const mix = position - lower;
    return ordered[lower] * (1 - mix) + ordered[upper] * mix;
  }

  function makeDistanceMatrix(points, metric) {
    const size = points.length;
    const matrix = Array.from({ length: size }, () => new Float64Array(size));
    for (let row = 0; row < size; row += 1) {
      for (let column = row + 1; column < size; column += 1) {
        const value = metric.distance(points[row].features, points[column].features);
        matrix[row][column] = value;
        matrix[column][row] = value;
      }
    }
    return matrix;
  }

  function matrixScale(matrix, indices) {
    const values = [];
    for (let row = 0; row < indices.length; row += 1) {
      for (let column = row + 1; column < indices.length; column += 1) {
        const value = matrix[indices[row]][indices[column]];
        if (value > EPSILON) values.push(value);
      }
    }
    return median(values) || 1;
  }

  function makeEnsembleMatrix(matrices, indices) {
    const size = matrices[0].length;
    const scales = matrices.map((matrix) => matrixScale(matrix, indices));
    const ensemble = Array.from({ length: size }, () => new Float64Array(size));
    for (let row = 0; row < size; row += 1) {
      for (let column = row + 1; column < size; column += 1) {
        const value = median(
          matrices.map((matrix, metricIndex) => matrix[row][column] / scales[metricIndex])
        );
        ensemble[row][column] = value;
        ensemble[column][row] = value;
      }
    }
    return ensemble;
  }

  function multiplyMatrixVector(matrix, vector) {
    const output = new Float64Array(vector.length);
    for (let row = 0; row < matrix.length; row += 1) {
      let value = 0;
      for (let column = 0; column < vector.length; column += 1) {
        value += matrix[row][column] * vector[column];
      }
      output[row] = value;
    }
    return output;
  }

  function dot(a, b) {
    let value = 0;
    for (let index = 0; index < a.length; index += 1) value += a[index] * b[index];
    return value;
  }

  function topEigenpair(matrix, previousVectors, seed) {
    const size = matrix.length;
    let vector = new Float64Array(size);
    for (let index = 0; index < size; index += 1) {
      vector[index] = Math.sin((index + 1) * (seed + 1.371)) + Math.cos((index + 2) * 0.731);
    }

    const orthogonalize = (target) => {
      previousVectors.forEach((previous) => {
        const projection = dot(target, previous);
        for (let index = 0; index < size; index += 1) {
          target[index] -= projection * previous[index];
        }
      });
      const norm = Math.sqrt(dot(target, target)) || 1;
      for (let index = 0; index < size; index += 1) target[index] /= norm;
      return target;
    };

    vector = orthogonalize(vector);
    for (let iteration = 0; iteration < 120; iteration += 1) {
      vector = orthogonalize(multiplyMatrixVector(matrix, vector));
    }
    const product = multiplyMatrixVector(matrix, vector);
    return { vector, value: dot(vector, product) };
  }

  function classicalMDS(distanceMatrix) {
    const size = distanceMatrix.length;
    const squaredDistances = Array.from({ length: size }, () => new Float64Array(size));
    const rowMeans = new Float64Array(size);
    let totalMean = 0;

    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const value = square(distanceMatrix[row][column]);
        squaredDistances[row][column] = value;
        rowMeans[row] += value / size;
        totalMean += value / (size * size);
      }
    }

    const gram = Array.from({ length: size }, () => new Float64Array(size));
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        gram[row][column] =
          -0.5 * (squaredDistances[row][column] - rowMeans[row] - rowMeans[column] + totalMean);
      }
    }

    const first = topEigenpair(gram, [], 1);
    const second = topEigenpair(gram, [first.vector], 2);
    const firstScale = Math.sqrt(Math.max(first.value, EPSILON));
    const secondScale = Math.sqrt(Math.max(second.value, EPSILON));
    const positions = Array.from({ length: size }, (_, index) => ({
      x: first.vector[index] * firstScale,
      y: second.vector[index] * secondScale,
    }));
    return normalizePositions(positions);
  }

  function normalizePositions(positions) {
    const meanX = sum(positions.map((position) => position.x)) / positions.length;
    const meanY = sum(positions.map((position) => position.y)) / positions.length;
    const centered = positions.map((position) => ({
      x: position.x - meanX,
      y: position.y - meanY,
    }));
    const radii = centered.map((position) => Math.hypot(position.x, position.y));
    const scale = quantile(radii, 0.94) || 1;
    return centered.map((position) => ({
      x: clamp(position.x / scale, -1.25, 1.25),
      y: clamp(position.y / scale, -1.25, 1.25),
    }));
  }

  function alignPositions(positions, reference) {
    let best = positions;
    let bestError = Infinity;
    [false, true].forEach((reflect) => {
      const candidate = positions.map((position) => ({
        x: position.x,
        y: reflect ? -position.y : position.y,
      }));
      let same = 0;
      let cross = 0;
      candidate.forEach((position, index) => {
        same += position.x * reference[index].x + position.y * reference[index].y;
        cross += position.x * reference[index].y - position.y * reference[index].x;
      });
      const angle = Math.atan2(cross, same);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const rotated = candidate.map((position) => ({
        x: position.x * cosine - position.y * sine,
        y: position.x * sine + position.y * cosine,
      }));
      const error = sum(
        rotated.map(
          (position, index) =>
            square(position.x - reference[index].x) + square(position.y - reference[index].y)
        )
      );
      if (error < bestError) {
        bestError = error;
        best = rotated;
      }
    });
    return best;
  }

  function pearsonFidelity(matrix, positions, indices) {
    const source = [];
    const display = [];
    for (let row = 0; row < indices.length; row += 1) {
      for (let column = row + 1; column < indices.length; column += 1) {
        const left = indices[row];
        const right = indices[column];
        source.push(matrix[left][right]);
        display.push(
          Math.hypot(
            positions[left].x - positions[right].x,
            positions[left].y - positions[right].y
          )
        );
      }
    }
    const meanSource = sum(source) / source.length;
    const meanDisplay = sum(display) / display.length;
    let numerator = 0;
    let sourceVariance = 0;
    let displayVariance = 0;
    source.forEach((value, index) => {
      const sourceDelta = value - meanSource;
      const displayDelta = display[index] - meanDisplay;
      numerator += sourceDelta * displayDelta;
      sourceVariance += square(sourceDelta);
      displayVariance += square(displayDelta);
    });
    const denominator = Math.sqrt(sourceVariance * displayVariance);
    return denominator > EPSILON ? numerator / denominator : 0;
  }

  function separationRatio(matrix, dataset) {
    const within = [];
    const between = [];
    const indices = dataset.knownObjectIndices;
    for (let row = 0; row < indices.length; row += 1) {
      for (let column = row + 1; column < indices.length; column += 1) {
        const left = indices[row];
        const right = indices[column];
        const bucket =
          dataset.points[left].classIndex === dataset.points[right].classIndex ? within : between;
        bucket.push(matrix[left][right]);
      }
    }
    return (sum(between) / between.length) / ((sum(within) / within.length) || 1);
  }

  function nearestNeighbors(matrix, dataset) {
    const output = new Map();
    dataset.objectIndices.forEach((index) => {
      const ordered = dataset.objectIndices
        .filter((candidate) => candidate !== index)
        .sort((left, right) => matrix[index][left] - matrix[index][right]);
      output.set(index, ordered.slice(0, 2));
    });
    return output;
  }

  function computeAnomalyScores(dataset, matrices) {
    const normalizedByMetric = [];
    matrices.forEach((matrix) => {
      const raw = new Map(dataset.objectIndices.map((pointIndex) => [
        pointIndex,
        Math.min(...dataset.centroidIndices.map((centroidIndex) => matrix[pointIndex][centroidIndex])),
      ]));
      const reference = dataset.knownObjectIndices.map((pointIndex) => raw.get(pointIndex));
      const scores = new Map();
      dataset.objectIndices.forEach((pointIndex) => {
        const value = raw.get(pointIndex);
        scores.set(pointIndex, reference.filter((known) => known <= value).length / reference.length);
      });
      normalizedByMetric.push(scores);
    });

    const aggregate = new Map();
    const votes = new Map();
    dataset.objectIndices.forEach((pointIndex) => {
      const values = normalizedByMetric.map((scores) => scores.get(pointIndex));
      aggregate.set(pointIndex, median(values));
      votes.set(pointIndex, values.filter((value) => value >= 0.9).length);
    });
    return { normalizedByMetric, aggregate, votes };
  }

  function buildModel(dataset = buildDataset()) {
    const matrices = Object.fromEntries(
      METRICS.map((metric) => [metric.id, makeDistanceMatrix(dataset.points, metric)])
    );
    const ensembleMatrix = makeEnsembleMatrix(
      METRICS.map((metric) => matrices[metric.id]),
      dataset.objectIndices
    );
    const euclideanLayout = classicalMDS(matrices.euclidean);
    const layouts = { euclidean: euclideanLayout };
    METRICS.forEach((metric) => {
      if (metric.id === "euclidean") return;
      layouts[metric.id] = alignPositions(classicalMDS(matrices[metric.id]), euclideanLayout);
    });
    layouts.ensemble = alignPositions(classicalMDS(ensembleMatrix), euclideanLayout);

    const fidelity = {};
    const separation = {};
    const neighbors = {};
    METRICS.forEach((metric) => {
      fidelity[metric.id] = pearsonFidelity(
        matrices[metric.id],
        layouts[metric.id],
        dataset.objectIndices
      );
      separation[metric.id] = separationRatio(matrices[metric.id], dataset);
      neighbors[metric.id] = nearestNeighbors(matrices[metric.id], dataset);
    });
    fidelity.ensemble = pearsonFidelity(ensembleMatrix, layouts.ensemble, dataset.objectIndices);
    separation.ensemble = separationRatio(ensembleMatrix, dataset);
    neighbors.ensemble = nearestNeighbors(ensembleMatrix, dataset);

    const anomaly = computeAnomalyScores(
      dataset,
      METRICS.map((metric) => matrices[metric.id])
    );
    const highlightIndex = [...dataset.candidateIndices].sort(
      (left, right) => anomaly.aggregate.get(right) - anomaly.aggregate.get(left)
    )[0];

    return {
      dataset,
      matrices,
      ensembleMatrix,
      layouts,
      fidelity,
      separation,
      neighbors,
      anomaly,
      highlightIndex,
    };
  }

  let sharedModel = null;

  function getModel() {
    if (!sharedModel) sharedModel = buildModel();
    return sharedModel;
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function metricOptions() {
    return METRICS.map(
      (metric) => `<option value="${metric.id}">${escapeHTML(metric.name)}</option>`
    ).join("");
  }

  function fullTemplate() {
    return `
      <section class="ds-panel" aria-label="Interactive distance geometry explorer">
        <div class="ds-panel-head">
          <div class="ds-metric-copy">
            <span class="ds-kicker">geometry <b data-ds-count>01 / 16</b></span>
            <h2 data-ds-title>Euclidean</h2>
            <p data-ds-note></p>
          </div>
          <div class="ds-view-switch" role="group" aria-label="Visualization view">
            <button type="button" data-ds-view="map" aria-pressed="true">Remap</button>
            <button type="button" data-ds-view="contours" aria-pressed="false">Contours</button>
            <button type="button" data-ds-view="ensemble" aria-pressed="false">DiMMAD</button>
          </div>
        </div>
        <div class="ds-stage" data-ds-stage>
          <canvas class="ds-canvas" data-ds-canvas role="img" aria-label="Supernova feature vectors remapped by Euclidean distance"></canvas>
          <div class="ds-stage-label ds-stage-label-left" data-ds-stage-label>PAIRWISE DISTANCES → 2D EUCLIDEAN DISPLAY</div>
          <div class="ds-stage-label ds-stage-label-right" data-ds-emphasis></div>
          <div class="ds-tooltip" data-ds-tooltip hidden></div>
          <div class="ds-live" data-ds-live aria-live="polite"></div>
        </div>
        <div class="ds-controls">
          <button type="button" class="ds-icon-button" data-ds-prev aria-label="Previous distance metric">←</button>
          <label class="ds-select-wrap">
            <span>distance metric</span>
            <select data-ds-select aria-label="Distance metric">${metricOptions()}</select>
          </label>
          <div class="ds-formula" data-ds-formula></div>
          <button type="button" class="ds-icon-button" data-ds-next aria-label="Next distance metric">→</button>
          <button type="button" class="ds-tour-button" data-ds-tour aria-pressed="true"><span data-ds-tour-icon>Ⅱ</span><span data-ds-tour-label>pause tour</span></button>
        </div>
        <div class="ds-presets" aria-label="Featured distance metrics">
          ${TOUR_IDS.map(
            (id) => `<button type="button" data-ds-metric="${id}">${escapeHTML(METRIC_BY_ID[id].name)}</button>`
          ).join("")}
        </div>
        <div class="ds-readouts">
          <div><span>cluster separation</span><strong data-ds-separation>—</strong><small>between ÷ within</small></div>
          <div><span>2D fidelity</span><strong data-ds-fidelity>—</strong><small>distance correlation</small></div>
          <div class="ds-readout-wide"><span data-ds-decision-label>nearest prototype</span><strong data-ds-decision>—</strong><small data-ds-decision-note></small></div>
        </div>
        <div class="ds-legend" aria-label="Object classes">
          ${CLASS_META.map(
            (item) => `<span><i style="--ds-legend-color:${item.color}" data-shape="${item.shape}"></i>${escapeHTML(item.name)}</span>`
          ).join("")}
          <span class="ds-legend-note">illustrative normalized features</span>
        </div>
      </section>`;
  }

  function compactTemplate() {
    return `
      <span class="ds-compact-stage">
        <canvas class="ds-canvas" data-ds-canvas role="img" aria-label="Animated DiMMAD metric-space anomaly preview"></canvas>
        <b class="ds-compact-top" data-ds-compact-metric>Euclidean</b>
        <span class="ds-compact-classes">
          ${CLASS_META.map((item) => `<span><i style="--ds-key:${item.color}" data-shape="${item.shape}"></i>${item.name}</span>`).join("")}
        </span>
      </span>`;
  }

  function projectionAxisLabels(metricId) {
    const metric = METRIC_BY_ID[metricId] || METRIC_BY_ID.euclidean;
    const stem = `${metric.name} distance → Euclidean`;
    return {
      x: `${stem} z₁ (MDS)`,
      y: `${stem} z₂ (MDS)`,
      description: `Pairwise ${metric.name} distances embedded in two Euclidean coordinates with classical MDS`,
    };
  }

  function hexToRGB(hex) {
    const clean = hex.replace("#", "");
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }

  function rgba(hex, alpha) {
    const color = hexToRGB(hex);
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
  }

  function easeInOutCubic(value) {
    return value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;
  }

  function convexHull(points) {
    if (points.length < 3) return points;
    const ordered = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
    const cross = (origin, left, right) =>
      (left.x - origin.x) * (right.y - origin.y) -
      (left.y - origin.y) * (right.x - origin.x);
    const lower = [];
    ordered.forEach((point) => {
      while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
      lower.push(point);
    });
    const upper = [];
    [...ordered].reverse().forEach((point) => {
      while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
      upper.push(point);
    });
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function expandHull(points, factor) {
    if (!points.length) return points;
    const center = points.reduce(
      (total, point) => ({
        x: total.x + point.x / points.length,
        y: total.y + point.y / points.length,
      }),
      { x: 0, y: 0 }
    );
    return points.map((point) => ({
      x: center.x + (point.x - center.x) * factor,
      y: center.y + (point.y - center.y) * factor,
    }));
  }

  function formatDistance(value) {
    if (!Number.isFinite(value)) return "—";
    if (value === 0) return "0";
    if (value < 0.01) return value.toExponential(1);
    if (value < 1) return value.toFixed(2);
    if (value < 10) return value.toFixed(1);
    return Math.round(value).toString();
  }

  class DistanceSpace {
    constructor(root) {
      this.root = root;
      this.compact = root.dataset.distanceSpace === "compact";
      this.model = this.compact && window.FinkTnsSample
        ? buildModel(buildDatasetFromFink(window.FinkTnsSample))
        : getModel();
      this.view = "map";
      this.metricId = "euclidean";
      this.previousMetricId = "euclidean";
      this.playing = !REDUCED_MOTION.matches;
      this.visible = true;
      this.lastCycle = performance.now();
      this.transitionStart = performance.now();
      this.transitionDuration = REDUCED_MOTION.matches ? 0 : 1150;
      this.fromPositions = this.model.layouts.euclidean.map((position) => ({ ...position }));
      this.targetPositions = this.model.layouts.euclidean;
      this.currentPositions = this.fromPositions.map((position) => ({ ...position }));
      this.selectedIndex = this.model.highlightIndex;
      this.anchorIndex = this.model.dataset.centroidIndices[0];
      this.hoverIndex = null;
      this.pointer = { x: 0, y: 0 };
      this.fieldCache = new Map();
      this.screenPositions = [];
      this.compactMapTransform = null;
      this.stars = [];
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.raf = null;

      root.classList.add("ds-viz-root", this.compact ? "ds-is-compact" : "ds-is-full");
      root.innerHTML = this.compact ? compactTemplate() : fullTemplate();
      this.canvas = root.querySelector("[data-ds-canvas]");
      this.context = this.canvas.getContext("2d", { alpha: true });
      this.stage = this.compact ? root.querySelector(".ds-compact-stage") : root.querySelector("[data-ds-stage]");
      this.collectElements();
      this.bindEvents();
      this.updateInterface();

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.stage);
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          this.visible = entries[0].isIntersecting;
          if (this.visible) this.start();
          else this.stop();
        },
        { threshold: 0.08 }
      );
      this.intersectionObserver.observe(root);
      this.resize();
      this.start();
    }

    collectElements() {
      if (this.compact) {
        this.compactMetric = this.root.querySelector("[data-ds-compact-metric]");
        return;
      }
      this.title = this.root.querySelector("[data-ds-title]");
      this.note = this.root.querySelector("[data-ds-note]");
      this.count = this.root.querySelector("[data-ds-count]");
      this.formula = this.root.querySelector("[data-ds-formula]");
      this.emphasis = this.root.querySelector("[data-ds-emphasis]");
      this.stageLabel = this.root.querySelector("[data-ds-stage-label]");
      this.select = this.root.querySelector("[data-ds-select]");
      this.tooltip = this.root.querySelector("[data-ds-tooltip]");
      this.live = this.root.querySelector("[data-ds-live]");
      this.separation = this.root.querySelector("[data-ds-separation]");
      this.fidelity = this.root.querySelector("[data-ds-fidelity]");
      this.decision = this.root.querySelector("[data-ds-decision]");
      this.decisionLabel = this.root.querySelector("[data-ds-decision-label]");
      this.decisionNote = this.root.querySelector("[data-ds-decision-note]");
      this.tourButton = this.root.querySelector("[data-ds-tour]");
      this.tourIcon = this.root.querySelector("[data-ds-tour-icon]");
      this.tourLabel = this.root.querySelector("[data-ds-tour-label]");
    }

    bindEvents() {
      REDUCED_MOTION.addEventListener("change", (event) => {
        this.transitionDuration = event.matches ? 0 : 1150;
        if (event.matches) this.setPlaying(false);
      });

      if (this.compact) return;

      this.root.querySelector("[data-ds-prev]").addEventListener("click", () => {
        this.setPlaying(false);
        this.stepMetric(-1);
      });
      this.root.querySelector("[data-ds-next]").addEventListener("click", () => {
        this.setPlaying(false);
        this.stepMetric(1);
      });
      this.select.addEventListener("change", () => {
        this.setPlaying(false);
        this.setMetric(this.select.value, true);
      });
      this.tourButton.addEventListener("click", () => this.setPlaying(!this.playing));
      this.root.querySelectorAll("[data-ds-metric]").forEach((button) => {
        button.addEventListener("click", () => {
          this.setPlaying(false);
          this.setMetric(button.dataset.dsMetric, true);
        });
      });
      this.root.querySelectorAll("[data-ds-view]").forEach((button) => {
        button.addEventListener("click", () => {
          this.setPlaying(false);
          this.setView(button.dataset.dsView, true);
        });
      });

      this.canvas.addEventListener("pointermove", (event) => this.handlePointerMove(event));
      this.canvas.addEventListener("pointerleave", () => {
        this.hoverIndex = null;
        this.tooltip.hidden = true;
      });
      this.canvas.addEventListener("click", () => {
        if (this.hoverIndex === null) return;
        if (this.view === "contours") this.anchorIndex = this.hoverIndex;
        else this.selectedIndex = this.hoverIndex;
        this.updateInterface();
        this.draw(performance.now());
      });
      this.root.tabIndex = 0;
      this.root.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          this.setPlaying(false);
          this.stepMetric(event.key === "ArrowRight" ? 1 : -1);
        }
        if (event.key === " ") {
          event.preventDefault();
          this.setPlaying(!this.playing);
        }
      });
    }

    resize() {
      const bounds = this.stage.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      this.width = bounds.width;
      this.height = bounds.height;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      const random = mulberry32(Math.round(this.width * 17 + this.height * 31));
      this.stars = Array.from({ length: this.compact ? 36 : 78 }, () => ({
        x: random(),
        y: random(),
        radius: 0.35 + random() * 1.1,
        alpha: 0.12 + random() * 0.45,
        phase: random() * TAU,
      }));
      this.draw(performance.now());
    }

    start() {
      if (this.raf || !this.visible) return;
      const animate = (time) => {
        this.raf = null;
        if (!this.visible) return;
        if (this.playing && time - this.lastCycle > (this.compact ? 3300 : 4500)) {
          this.stepMetric(1, false);
        }
        this.draw(time);
        this.raf = requestAnimationFrame(animate);
      };
      this.raf = requestAnimationFrame(animate);
    }

    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
    }

    setPlaying(playing) {
      this.playing = playing && !REDUCED_MOTION.matches;
      this.lastCycle = performance.now();
      if (!this.compact) {
        this.tourButton.setAttribute("aria-pressed", String(this.playing));
        this.tourIcon.textContent = this.playing ? "Ⅱ" : "▶";
        this.tourLabel.textContent = this.playing ? "pause tour" : "play tour";
      }
      this.start();
    }

    getTargetLayout() {
      return this.view === "ensemble"
        ? this.model.layouts.ensemble
        : this.model.layouts[this.metricId];
    }

    getCurrentPositions(time) {
      if (!this.transitionDuration) return this.targetPositions.map((position) => ({ ...position }));
      const progress = clamp((time - this.transitionStart) / this.transitionDuration, 0, 1);
      const eased = easeInOutCubic(progress);
      return this.fromPositions.map((position, index) => ({
        x: position.x + (this.targetPositions[index].x - position.x) * eased,
        y: position.y + (this.targetPositions[index].y - position.y) * eased,
      }));
    }

    transitionTo(layout) {
      const now = performance.now();
      this.fromPositions = this.getCurrentPositions(now);
      this.targetPositions = layout;
      this.transitionStart = now;
      this.lastCycle = now;
    }

    stepMetric(direction, user = true) {
      if (this.view === "ensemble") this.setView("map", user);
      const activeIndex = TOUR_IDS.indexOf(this.metricId);
      const startIndex = activeIndex >= 0 ? activeIndex : 0;
      const nextIndex = (startIndex + direction + TOUR_IDS.length) % TOUR_IDS.length;
      this.setMetric(TOUR_IDS[nextIndex], user);
    }

    setMetric(metricId, user = false) {
      if (!METRIC_BY_ID[metricId]) return;
      if (this.view === "ensemble") this.view = "map";
      if (metricId !== this.metricId) {
        this.previousMetricId = this.metricId;
        this.metricId = metricId;
        this.transitionTo(this.model.layouts[metricId]);
      }
      if (user) this.lastCycle = performance.now();
      this.updateInterface();
      this.start();
    }

    setView(view, user = false) {
      if (!['map', 'contours', 'ensemble'].includes(view)) return;
      this.view = view;
      if (view !== "contours") this.transitionTo(this.getTargetLayout());
      if (user) this.lastCycle = performance.now();
      this.tooltip.hidden = true;
      this.hoverIndex = null;
      this.updateInterface();
      this.start();
    }

    updateInterface() {
      const metric = METRIC_BY_ID[this.metricId];
      if (this.compact) {
        const axes = projectionAxisLabels(this.metricId);
        this.compactMetric.textContent = metric.name;
        this.root.style.setProperty("--ds-live-color", metric.color);
        this.canvas.setAttribute(
          "aria-label",
          `${axes.description}; distances from the TDE anomaly to the three class prototypes are shown`
        );
        return;
      }

      this.tourButton.setAttribute("aria-pressed", String(this.playing));
      this.tourIcon.textContent = this.playing ? "Ⅱ" : "▶";
      this.tourLabel.textContent = this.playing ? "pause tour" : "play tour";

      const ensemble = this.view === "ensemble";
      this.title.textContent = ensemble ? "16-metric consensus" : metric.name;
      this.note.textContent = ensemble
        ? "DiMMAD normalizes each geometry, then looks for objects far from every known prototype across the ensemble."
        : metric.note;
      this.count.textContent = ensemble
        ? "DiMMAD"
        : `${String(METRICS.findIndex((item) => item.id === this.metricId) + 1).padStart(2, "0")} / ${METRICS.length}`;
      this.formula.textContent = ensemble ? "median(normalized d₁ … d₁₆)" : metric.formula;
      this.emphasis.textContent = ensemble ? "ROBUSTLY DISTANT" : metric.emphasis.toUpperCase();
      this.stageLabel.textContent =
        this.view === "contours"
          ? `DISTANCE FROM ${this.model.dataset.points[this.anchorIndex].name.toUpperCase()} · CLICK TO RE-CENTER`
          : ensemble
            ? "MULTI-METRIC DISTANCES → 2D CONSENSUS MAP"
            : "PAIRWISE DISTANCES → 2D EUCLIDEAN DISPLAY";
      this.select.value = this.metricId;
      this.select.disabled = ensemble;
      this.root.style.setProperty("--ds-live-color", ensemble ? "#ffb000" : metric.color);
      this.root.dataset.dsActiveView = this.view;
      this.root.querySelectorAll("[data-ds-view]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.dsView === this.view));
      });
      this.root.querySelectorAll("[data-ds-metric]").forEach((button) => {
        const active = !ensemble && button.dataset.dsMetric === this.metricId;
        button.classList.toggle("is-active", active);
        button.disabled = ensemble;
      });

      const layoutId = ensemble ? "ensemble" : this.metricId;
      this.separation.textContent = `${this.model.separation[layoutId].toFixed(2)}×`;
      this.fidelity.textContent = this.model.fidelity[layoutId].toFixed(2);

      const pointIndex = this.selectedIndex;
      const point = this.model.dataset.points[pointIndex];
      if (ensemble) {
        const score = this.model.anomaly.aggregate.get(pointIndex) || 0;
        const votes = this.model.anomaly.votes.get(pointIndex) || 0;
        this.decisionLabel.textContent = "consensus anomaly score";
        this.decision.textContent = `${Math.round(score * 100)} / 100`;
        this.decisionNote.textContent = `${point.name} · ${votes}/${METRICS.length} strong-distance votes`;
      } else {
        const matrix = this.model.matrices[this.metricId];
        const nearest = [...this.model.dataset.centroidIndices].sort(
          (left, right) => matrix[pointIndex][left] - matrix[pointIndex][right]
        )[0];
        this.decisionLabel.textContent = "nearest prototype";
        this.decision.textContent = this.model.dataset.points[nearest].name.replace(" prototype", "");
        this.decisionNote.textContent = `${point.name} · d = ${formatDistance(matrix[pointIndex][nearest])}`;
      }

      this.canvas.setAttribute(
        "aria-label",
        ensemble
          ? "Supernova feature vectors remapped using the DiMMAD multi-metric consensus"
          : this.view === "contours"
            ? `${metric.name} distance contours around ${this.model.dataset.points[this.anchorIndex].name}`
            : `Supernova feature vectors remapped by ${metric.name} distance`
      );
      this.live.textContent = ensemble
        ? "DiMMAD consensus view"
        : `${metric.name} ${this.view === "contours" ? "contour" : "remap"} view`;
    }

    handlePointerMove(event) {
      if (!this.screenPositions.length) return;
      const bounds = this.canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      this.pointer = { x, y };
      let nearest = null;
      let nearestDistance = 18;
      this.screenPositions.forEach((position, index) => {
        if (!position) return;
        const distance = Math.hypot(position.x - x, position.y - y);
        if (distance < nearestDistance) {
          nearest = index;
          nearestDistance = distance;
        }
      });
      this.hoverIndex = nearest;
      if (nearest === null) {
        this.tooltip.hidden = true;
        return;
      }
      const point = this.model.dataset.points[nearest];
      const classMeta = CLASS_META[point.classIndex];
      const anchorText =
        this.view === "contours"
          ? `d(anchor) ${formatDistance(
              METRIC_BY_ID[this.metricId].distance(
                point.features,
                this.model.dataset.points[this.anchorIndex].features
              )
            )}`
          : `${FEATURE_NAMES[0]} ${point.features[0].toFixed(2)} · ${FEATURE_NAMES[1]} ${point.features[1].toFixed(2)}`;
      this.tooltip.innerHTML = `<b>${escapeHTML(point.name)}</b><span>${escapeHTML(classMeta.name)} · ${escapeHTML(anchorText)}</span>`;
      this.tooltip.hidden = false;
      const tooltipWidth = 220;
      const tooltipHeight = 58;
      this.tooltip.style.left = `${clamp(x + 15, 10, this.width - tooltipWidth - 10)}px`;
      this.tooltip.style.top = `${clamp(y + 15, 10, this.height - tooltipHeight - 10)}px`;
    }

    draw(time) {
      if (!this.width || !this.height) return;
      const context = this.context;
      context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      context.clearRect(0, 0, this.width, this.height);
      this.drawBackdrop(time);
      if (this.view === "contours" && !this.compact) this.drawContourView(time);
      else this.drawMapView(time, this.view === "ensemble");
    }

    drawBackdrop(time) {
      if (this.compact) return;
      const context = this.context;
      const gradient = context.createRadialGradient(
        this.width * 0.52,
        this.height * 0.46,
        0,
        this.width * 0.52,
        this.height * 0.46,
        Math.max(this.width, this.height) * 0.72
      );
      gradient.addColorStop(0, "rgba(18, 35, 64, 0.42)");
      gradient.addColorStop(0.55, "rgba(7, 17, 35, 0.18)");
      gradient.addColorStop(1, "rgba(2, 7, 18, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, this.width, this.height);

      this.stars.forEach((star) => {
        const shimmer = REDUCED_MOTION.matches
          ? 0.8
          : 0.62 + Math.sin(time * 0.0007 + star.phase) * 0.25;
        context.beginPath();
        context.arc(star.x * this.width, star.y * this.height, star.radius, 0, TAU);
        context.fillStyle = `rgba(190, 222, 255, ${star.alpha * shimmer})`;
        context.fill();
      });
    }

    mapToScreen(position) {
      if (this.compact && this.compactMapTransform) {
        return {
          x: this.compactMapTransform.centerX + position.x * this.compactMapTransform.scale,
          y: this.compactMapTransform.centerY - position.y * this.compactMapTransform.scale,
        };
      }
      const horizontalPadding = this.compact ? 25 : Math.max(62, this.width * 0.075);
      const verticalPadding = this.compact ? 42 : Math.max(54, this.height * 0.1);
      const availableWidth = this.width - horizontalPadding * 2;
      const availableHeight = this.height - verticalPadding * 2;
      const scale = Math.min(availableWidth / 2.45, availableHeight / 2.35);
      return {
        x: this.width * 0.5 + position.x * scale,
        y: this.height * (this.compact ? 0.51 : 0.53) + position.y * scale * (this.compact ? -1 : 1),
      };
    }

    compactTransformFor(positions) {
      const visible = this.model.dataset.objectIndices.map((index) => positions[index]);
      const minX = Math.min(...visible.map((position) => position.x));
      const maxX = Math.max(...visible.map((position) => position.x));
      const minY = Math.min(...visible.map((position) => position.y));
      const maxY = Math.max(...visible.map((position) => position.y));
      const left = 10;
      const right = this.width - 10;
      const top = 38;
      const bottom = this.height - 37;
      const margin = 1.16;
      const scale = Math.min(
        (right - left) / (Math.max(maxX - minX, 0.1) * margin),
        (bottom - top) / (Math.max(maxY - minY, 0.1) * margin)
      );
      return {
        scale,
        centerX: (left + right) / 2 - ((minX + maxX) / 2) * scale,
        centerY: (top + bottom) / 2 + ((minY + maxY) / 2) * scale,
      };
    }

    compactTransformAt(time) {
      const target = this.compactTransformFor(this.targetPositions);
      if (!this.transitionDuration) return target;
      const progress = clamp((time - this.transitionStart) / this.transitionDuration, 0, 1);
      const eased = easeInOutCubic(progress);
      const from = this.compactTransformFor(this.fromPositions);
      return {
        scale: from.scale + (target.scale - from.scale) * eased,
        centerX: from.centerX + (target.centerX - from.centerX) * eased,
        centerY: from.centerY + (target.centerY - from.centerY) * eased,
      };
    }

    drawGrid() {
      const context = this.context;
      const gap = this.compact ? 38 : 52;
      context.save();
      context.fillStyle = this.compact ? "rgba(119, 119, 119, 0.12)" : "rgba(151, 190, 224, 0.105)";
      for (let x = gap / 2; x < this.width; x += gap) {
        for (let y = gap / 2; y < this.height; y += gap) {
          context.fillRect(x, y, 1, 1);
        }
      }
      context.restore();
    }

    drawPrototypeRegions() {
      const context = this.context;
      this.model.dataset.centroidIndices.forEach((centroidIndex) => {
        const classIndex = this.model.dataset.points[centroidIndex].classIndex;
        const points = this.model.dataset.knownObjectIndices
          .filter((index) => this.model.dataset.points[index].classIndex === classIndex)
          .map((index) => this.screenPositions[index]);
        const hull = expandHull(convexHull(points), 1.08);
        if (hull.length < 3) return;
        const color = CLASS_META[classIndex].color;
        context.save();
        context.beginPath();
        context.moveTo(hull[0].x, hull[0].y);
        hull.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.closePath();
        context.fillStyle = rgba(color, 0.04);
        context.strokeStyle = rgba(color, 0.23);
        context.lineWidth = 0.75;
        context.fill();
        context.stroke();
        context.restore();
      });
    }

    drawMapView(time, ensemble) {
      this.drawGrid();
      this.currentPositions = this.getCurrentPositions(time);
      if (this.compact) {
        this.compactMapTransform = this.compactTransformAt(time);
      }
      this.screenPositions = this.currentPositions.map((position) => this.mapToScreen(position));
      if (this.compact) this.drawPrototypeRegions();
      const layoutId = ensemble ? "ensemble" : this.metricId;
      const matrix = ensemble ? this.model.ensembleMatrix : this.model.matrices[this.metricId];
      const neighbors = this.model.neighbors[layoutId];
      const context = this.context;
      const progress = this.transitionDuration
        ? clamp((time - this.transitionStart) / this.transitionDuration, 0, 1)
        : 1;

      context.save();
      context.lineWidth = this.compact ? 0.65 : 0.85;
      this.model.dataset.objectIndices.forEach((index) => {
        (neighbors.get(index) || []).forEach((neighbor) => {
          if (neighbor < index) return;
          const left = this.screenPositions[index];
          const right = this.screenPositions[neighbor];
          const sameClass =
            this.model.dataset.points[index].classIndex ===
            this.model.dataset.points[neighbor].classIndex;
          context.beginPath();
          context.moveTo(left.x, left.y);
          context.lineTo(right.x, right.y);
          context.strokeStyle = sameClass
            ? rgba(CLASS_META[this.model.dataset.points[index].classIndex].color, this.compact ? 0.12 : 0.15)
            : this.compact ? "rgba(119, 119, 119, 0.08)" : "rgba(151, 190, 224, 0.07)";
          context.stroke();
        });
      });
      context.restore();

      if (progress < 1 && !REDUCED_MOTION.matches) {
        context.save();
        context.lineWidth = this.compact ? 0.7 : 1;
        this.fromPositions.forEach((position, index) => {
          if (this.model.dataset.points[index].kind === "centroid") return;
          const from = this.mapToScreen(position);
          const current = this.screenPositions[index];
          if (Math.hypot(from.x - current.x, from.y - current.y) < 4) return;
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(current.x, current.y);
          context.strokeStyle = rgba(
            CLASS_META[this.model.dataset.points[index].classIndex].color,
            0.18 * (1 - progress)
          );
          context.stroke();
        });
        context.restore();
      }

      this.drawDecisionLines(matrix, ensemble);

      if (!this.compact) {
        this.model.dataset.centroidIndices.forEach((index) => this.drawCentroid(index));
      }
      this.model.dataset.objectIndices.forEach((index) => this.drawObject(index, time, ensemble));
      if (ensemble && !this.compact) this.drawVoteOrbit(time);
    }

    drawDecisionLines(matrix, ensemble) {
      const context = this.context;
      const selected = this.selectedIndex;
      if (!this.screenPositions[selected]) return;
      const nearest = [...this.model.dataset.centroidIndices].sort(
        (left, right) => matrix[selected][left] - matrix[selected][right]
      )[0];
      this.model.dataset.centroidIndices.forEach((centroidIndex) => {
        const start = this.screenPositions[selected];
        const end = this.screenPositions[centroidIndex];
        const active = centroidIndex === nearest;
        context.save();
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.setLineDash(this.compact ? (active ? [] : [2, 5]) : (active ? [5, 4] : [2, 6]));
        context.lineWidth = active ? (this.compact ? 1.2 : 1.35) : (this.compact ? 0.7 : 0.75);
        context.strokeStyle = this.compact
          ? active
            ? rgba("#7DDEB2", 0.84)
            : "rgba(119, 119, 119, 0.36)"
          : active
            ? ensemble
              ? "rgba(255, 190, 55, 0.48)"
              : "rgba(194, 231, 255, 0.38)"
            : "rgba(150, 184, 212, 0.13)";
        context.stroke();
        context.restore();
      });
    }

    drawCentroid(index) {
      const context = this.context;
      const point = this.model.dataset.points[index];
      const position = this.screenPositions[index];
      const color = CLASS_META[point.classIndex].color;
      const radius = this.compact ? 5 : 7;
      context.save();
      context.translate(position.x, position.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = this.compact ? getComputedStyle(document.documentElement).getPropertyValue("--background-color").trim() || "#fff" : "rgba(5, 12, 26, 0.92)";
      context.strokeStyle = color;
      context.lineWidth = this.compact ? 1.4 : 2;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.strokeRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
      if (!this.compact) {
        context.save();
        context.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        context.fillStyle = "rgba(222, 239, 255, 0.82)";
        context.textAlign = "center";
        context.fillText(CLASS_META[point.classIndex].name.toUpperCase(), position.x, position.y - 16);
        context.restore();
      }
    }

    drawObject(index, time, ensemble) {
      const context = this.context;
      const point = this.model.dataset.points[index];
      const classMeta = CLASS_META[point.classIndex];
      const position = this.screenPositions[index];
      const selected = index === this.selectedIndex || index === this.hoverIndex;
      const baseRadius = point.kind === "candidate" ? (this.compact ? 3.8 : 5.1) : (this.compact ? 2.7 : 3.7);

      if (ensemble) {
        const score = this.model.anomaly.aggregate.get(index) || 0;
        if (score > 0.48) {
          const haloRadius = baseRadius + 5 + score * (this.compact ? 5 : 10);
          const halo = context.createRadialGradient(
            position.x,
            position.y,
            baseRadius,
            position.x,
            position.y,
            haloRadius
          );
          halo.addColorStop(0, rgba("#ffb000", 0.18 * score));
          halo.addColorStop(1, "rgba(255, 176, 0, 0)");
          context.beginPath();
          context.arc(position.x, position.y, haloRadius, 0, TAU);
          context.fillStyle = halo;
          context.fill();
        }
      }

      if (selected) {
        const pulse = REDUCED_MOTION.matches ? 0 : Math.sin(time * 0.004) * 1.5;
        context.beginPath();
        context.arc(position.x, position.y, baseRadius + 6 + pulse, 0, TAU);
        context.strokeStyle = rgba(classMeta.color, index === this.selectedIndex ? 0.72 : 0.48);
        context.lineWidth = 1.2;
        context.stroke();
      }

      this.drawShape(position.x, position.y, baseRadius, classMeta, point.kind === "candidate");
    }

    drawShape(x, y, radius, classMeta, candidate) {
      const context = this.context;
      context.save();
      context.translate(x, y);
      context.beginPath();
      if (classMeta.shape === "triangle") {
        context.moveTo(0, -radius * 1.2);
        context.lineTo(radius * 1.05, radius * 0.8);
        context.lineTo(-radius * 1.05, radius * 0.8);
        context.closePath();
      } else if (classMeta.shape === "square") {
        context.rect(-radius * 0.83, -radius * 0.83, radius * 1.66, radius * 1.66);
      } else if (classMeta.shape === "star") {
        for (let point = 0; point < 8; point += 1) {
          const angle = -Math.PI / 2 + (point * Math.PI) / 4;
          const distance = point % 2 === 0 ? radius * 1.35 : radius * 0.48;
          const pointX = Math.cos(angle) * distance;
          const pointY = Math.sin(angle) * distance;
          if (point === 0) context.moveTo(pointX, pointY);
          else context.lineTo(pointX, pointY);
        }
        context.closePath();
      } else {
        context.arc(0, 0, radius, 0, TAU);
      }
      context.fillStyle = classMeta.color;
      context.shadowColor = classMeta.color;
      context.shadowBlur = candidate ? 10 : 4;
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = candidate ? "rgba(255, 244, 200, 0.86)" : "rgba(255,255,255,0.32)";
      context.lineWidth = candidate ? 1 : 0.55;
      context.stroke();
      context.restore();
    }

    drawVoteOrbit(time) {
      const index = this.selectedIndex;
      const position = this.screenPositions[index];
      if (!position) return;
      const scores = this.model.anomaly.normalizedByMetric.map((metricScores) =>
        metricScores.get(index)
      );
      const context = this.context;
      const radius = 20;
      const gap = 0.055;
      scores.forEach((score, metricIndex) => {
        const start = -Math.PI / 2 + (metricIndex / METRICS.length) * TAU + gap;
        const end = -Math.PI / 2 + ((metricIndex + 1) / METRICS.length) * TAU - gap;
        context.beginPath();
        context.arc(position.x, position.y, radius, start, end);
        context.lineWidth = score >= 0.9 ? 2.2 : 1.1;
        context.strokeStyle =
          score >= 0.9 ? rgba(METRICS[metricIndex].color, 0.9) : "rgba(129, 159, 188, 0.2)";
        context.stroke();
      });
      if (!REDUCED_MOTION.matches) {
        context.beginPath();
        context.arc(position.x, position.y, radius + 4 + Math.sin(time * 0.003) * 1.5, 0, TAU);
        context.strokeStyle = "rgba(255, 176, 0, 0.18)";
        context.lineWidth = 1;
        context.stroke();
      }
    }

    contourBounds() {
      return {
        left: Math.max(48, this.width * 0.065),
        top: Math.max(42, this.height * 0.075),
        right: this.width - Math.max(28, this.width * 0.04),
        bottom: this.height - Math.max(44, this.height * 0.09),
      };
    }

    getField(metricId, anchorIndex) {
      const cacheKey = `${metricId}:${anchorIndex}`;
      if (this.fieldCache.has(cacheKey)) return this.fieldCache.get(cacheKey);
      const metric = METRIC_BY_ID[metricId];
      const anchor = this.model.dataset.points[anchorIndex].features;
      const width = 120;
      const height = 76;
      const values = new Float32Array(width * height);
      const nonzero = [];
      for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
          const vector = [...anchor];
          vector[0] = 0.045 + (column / (width - 1)) * 0.925;
          vector[1] = 0.045 + (1 - row / (height - 1)) * 0.925;
          const value = metric.distance(vector, anchor);
          values[row * width + column] = value;
          if (value > EPSILON) nonzero.push(value);
        }
      }
      const maximum = quantile(nonzero, 0.94) || 1;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      const image = context.createImageData(width, height);
      const accent = hexToRGB(metric.color);
      const base = { r: 5, g: 12, b: 27 };
      for (let index = 0; index < values.length; index += 1) {
        const normalized = Math.pow(clamp(values[index] / maximum, 0, 1), 0.62);
        const mix = normalized * 0.68;
        image.data[index * 4] = Math.round(base.r * (1 - mix) + accent.r * mix);
        image.data[index * 4 + 1] = Math.round(base.g * (1 - mix) + accent.g * mix);
        image.data[index * 4 + 2] = Math.round(base.b * (1 - mix) + accent.b * mix);
        image.data[index * 4 + 3] = 235;
      }
      context.putImageData(image, 0, 0);
      const field = { canvas, values, maximum, width, height };
      this.fieldCache.set(cacheKey, field);
      return field;
    }

    drawContourView(time) {
      const context = this.context;
      const bounds = this.contourBounds();
      const width = bounds.right - bounds.left;
      const height = bounds.bottom - bounds.top;
      const field = this.getField(this.metricId, this.anchorIndex);
      const progress = this.transitionDuration
        ? clamp((time - this.transitionStart) / this.transitionDuration, 0, 1)
        : 1;

      context.save();
      context.beginPath();
      context.rect(bounds.left, bounds.top, width, height);
      context.clip();
      if (progress < 1 && this.previousMetricId !== this.metricId) {
        const previous = this.getField(this.previousMetricId, this.anchorIndex);
        context.globalAlpha = 1 - easeInOutCubic(progress);
        context.drawImage(previous.canvas, bounds.left, bounds.top, width, height);
      }
      context.globalAlpha = progress < 1 ? easeInOutCubic(progress) : 1;
      context.imageSmoothingEnabled = true;
      context.drawImage(field.canvas, bounds.left, bounds.top, width, height);
      context.globalAlpha = 1;
      this.drawContours(field, bounds);
      context.restore();

      context.strokeStyle = "rgba(174, 209, 236, 0.22)";
      context.lineWidth = 1;
      context.strokeRect(bounds.left, bounds.top, width, height);
      context.save();
      context.fillStyle = "rgba(196, 220, 240, 0.58)";
      context.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.textAlign = "center";
      context.fillText("RISE TIME →", bounds.left + width / 2, this.height - 16);
      context.translate(16, bounds.top + height / 2);
      context.rotate(-Math.PI / 2);
      context.fillText("FADE RATE →", 0, 0);
      context.restore();

      this.screenPositions = this.model.dataset.points.map((point) => ({
        x: bounds.left + ((point.features[0] - 0.045) / 0.925) * width,
        y: bounds.bottom - ((point.features[1] - 0.045) / 0.925) * height,
      }));
      this.model.dataset.centroidIndices.forEach((index) => this.drawCentroid(index));
      this.model.dataset.objectIndices.forEach((index) => this.drawObject(index, time, false));

      const anchor = this.screenPositions[this.anchorIndex];
      context.beginPath();
      context.arc(anchor.x, anchor.y, 12, 0, TAU);
      context.strokeStyle = "rgba(255,255,255,0.82)";
      context.setLineDash([3, 3]);
      context.lineWidth = 1.2;
      context.stroke();
      context.setLineDash([]);
    }

    drawContours(field, bounds) {
      const context = this.context;
      const thresholds = [0.2, 0.38, 0.56, 0.74].map(
        (fraction) => field.maximum * fraction
      );
      const step = 3;
      thresholds.forEach((threshold, thresholdIndex) => {
        context.beginPath();
        for (let row = 0; row < field.height - step; row += step) {
          for (let column = 0; column < field.width - step; column += step) {
            const topLeft = field.values[row * field.width + column];
            const topRight = field.values[row * field.width + column + step];
            const bottomRight = field.values[(row + step) * field.width + column + step];
            const bottomLeft = field.values[(row + step) * field.width + column];
            const code =
              (topLeft >= threshold ? 1 : 0) |
              (topRight >= threshold ? 2 : 0) |
              (bottomRight >= threshold ? 4 : 0) |
              (bottomLeft >= threshold ? 8 : 0);
            if (code === 0 || code === 15) continue;

            const interpolate = (first, second) => {
              const denominator = second - first;
              return Math.abs(denominator) > EPSILON
                ? clamp((threshold - first) / denominator, 0, 1)
                : 0.5;
            };
            const cellLeft = bounds.left + (column / (field.width - 1)) * (bounds.right - bounds.left);
            const cellTop = bounds.top + (row / (field.height - 1)) * (bounds.bottom - bounds.top);
            const cellWidth = (step / (field.width - 1)) * (bounds.right - bounds.left);
            const cellHeight = (step / (field.height - 1)) * (bounds.bottom - bounds.top);
            const edges = {
              top: {
                x: cellLeft + interpolate(topLeft, topRight) * cellWidth,
                y: cellTop,
              },
              right: {
                x: cellLeft + cellWidth,
                y: cellTop + interpolate(topRight, bottomRight) * cellHeight,
              },
              bottom: {
                x: cellLeft + interpolate(bottomLeft, bottomRight) * cellWidth,
                y: cellTop + cellHeight,
              },
              left: {
                x: cellLeft,
                y: cellTop + interpolate(topLeft, bottomLeft) * cellHeight,
              },
            };
            const segments = {
              1: [["left", "top"]],
              2: [["top", "right"]],
              3: [["left", "right"]],
              4: [["right", "bottom"]],
              5: [["left", "top"], ["right", "bottom"]],
              6: [["top", "bottom"]],
              7: [["left", "bottom"]],
              8: [["bottom", "left"]],
              9: [["top", "bottom"]],
              10: [["top", "right"], ["bottom", "left"]],
              11: [["right", "bottom"]],
              12: [["left", "right"]],
              13: [["top", "right"]],
              14: [["left", "top"]],
            }[code];
            (segments || []).forEach(([first, second]) => {
              context.moveTo(edges[first].x, edges[first].y);
              context.lineTo(edges[second].x, edges[second].y);
            });
          }
        }
        context.strokeStyle = `rgba(232, 245, 255, ${0.22 + thresholdIndex * 0.07})`;
        context.lineWidth = thresholdIndex === 2 ? 1.25 : 0.8;
        context.stroke();
      });
    }
  }

  /*
   * A small read-only surface for alternate presentations of the same model.
   * The production component above remains self-contained; the design-lab page
   * uses this rather than maintaining a second copy of the metric equations.
   */
  window.DistanceSpaceCore = Object.freeze({
    featureNames: Object.freeze([...FEATURE_NAMES]),
    classMeta: Object.freeze(CLASS_META.map((item) => Object.freeze({ ...item }))),
    metrics: Object.freeze(METRICS),
    metricById: Object.freeze({ ...METRIC_BY_ID }),
    featuredMetricIds: Object.freeze([...TOUR_IDS]),
    projectionAxisLabels,
    createFinkDataset: buildDatasetFromFink,
    createModel: buildModel,
    getModel,
  });

  function mount() {
    document.querySelectorAll("[data-distance-space]").forEach((root) => {
      if (!root.dataset.dsMounted) {
        root.dataset.dsMounted = "true";
        new DistanceSpace(root);
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
