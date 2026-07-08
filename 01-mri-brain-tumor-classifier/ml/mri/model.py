"""CNN model definition — VGG-16 transfer learning for MRI tumor classification."""
import tensorflow as tf
from tensorflow.keras import layers, models, regularizers  # type: ignore
from tensorflow.keras.applications import VGG16  # type: ignore


NUM_CLASSES = 4
IMG_SIZE = 224


def build_model(fine_tune_at: int = 15) -> tf.keras.Model:
    """
    Build VGG-16 based classifier.
    fine_tune_at: unfreeze layers from this index onward for fine-tuning pass.
    """
    base = VGG16(
        weights="imagenet",
        include_top=False,
        input_shape=(IMG_SIZE, IMG_SIZE, 3),
    )
    base.trainable = False

    inputs = tf.keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
    x = base(inputs, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dense(512, activation="relu", kernel_regularizer=regularizers.l2(1e-4))(x)
    x = layers.Dropout(0.5)(x)
    x = layers.Dense(256, activation="relu", kernel_regularizer=regularizers.l2(1e-4))(x)
    x = layers.Dropout(0.3)(x)
    outputs = layers.Dense(NUM_CLASSES, activation="softmax")(x)

    model = models.Model(inputs, outputs, name="mri_vgg16_classifier")
    return model


def unfreeze_top_layers(model: tf.keras.Model, fine_tune_at: int = 15):
    """Unfreeze VGG-16 layers from fine_tune_at onward for second training pass."""
    base = model.layers[1]  # VGG16 is second layer after Input
    base.trainable = True
    for layer in base.layers[:fine_tune_at]:
        layer.trainable = False


def compile_model(model: tf.keras.Model, learning_rate: float = 1e-4):
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
