import React, { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { X } from "lucide-react-native";

import AppButton from "../components/ui/AppButton";
import { appTheme } from "../theme/designSystem";
import { styles } from "./NutritionScreen.styles";

type BarcodeFoodScannerModalProps = {
  visible: boolean;
  isResolving: boolean;
  onBarcode: (barcode: string) => void;
  onClose: () => void;
};

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128"] as const;

export default function BarcodeFoodScannerModal({
  visible,
  isResolving,
  onBarcode,
  onClose,
}: BarcodeFoodScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [lastScannedValue, setLastScannedValue] = useState("");

  useEffect(() => {
    if (visible) {
      setLastScannedValue("");
      if (!permission?.granted) {
        void requestPermission();
      }
    }
  }, [permission?.granted, requestPermission, visible]);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    const value = String(result.data ?? "").trim();
    if (!value || value === lastScannedValue || isResolving) {
      return;
    }

    setLastScannedValue(value);
    onBarcode(value);
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={() => {
        if (!isResolving) {
          onClose();
        }
      }}
    >
      <View style={styles.scannerModalOverlay}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (!isResolving) {
              onClose();
            }
          }}
        />

        <View style={[styles.modalCard, styles.cameraModalCard]}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalTitleWrap}>
                <Text style={[styles.modalTitle, styles.modalTitleOnDark]}>Scan barcode</Text>
                <Text style={[styles.hintText, styles.hintTextOnDark]}>Point the camera at a packaged food barcode.</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close scanner"
                disabled={isResolving}
                onPress={onClose}
                style={[styles.modalIconButton, styles.modalIconButtonOnDark]}
              >
                <X size={18} color={appTheme.colors.card} strokeWidth={2.2} />
              </Pressable>
            </View>

            {!permission?.granted ? (
              <View style={styles.scannerPermissionBlock}>
                <Text style={[styles.emptyText, styles.hintTextOnDark]}>Camera permission is needed for barcode scan.</Text>
                <AppButton title="Allow Camera" onPress={() => void requestPermission()} />
              </View>
            ) : (
              <View style={styles.scannerFrame}>
                <CameraView
                  style={styles.scannerCamera}
                  facing="back"
                  barcodeScannerSettings={{
                    barcodeTypes: [...BARCODE_TYPES],
                  }}
                  onBarcodeScanned={isResolving ? undefined : handleBarcodeScanned}
                />
                <View style={styles.scannerGuide} pointerEvents="none" />
              </View>
            )}

            <Text style={[styles.hintText, styles.hintTextOnDark]}>
              {isResolving ? "Looking up barcode nutrition..." : "Scanned foods open as editable meal entries."}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
