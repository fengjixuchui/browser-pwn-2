#ifndef V8_TORQUE_DATA_VIEW_FROM_DSL_BASE_H__
#define V8_TORQUE_DATA_VIEW_FROM_DSL_BASE_H__

#include "src/builtins/builtins-data-view-gen.h"


 namespace v8 {
namespace internal {

class DataViewBuiltinsFromDSLAssembler: public DataViewBuiltinsAssembler {
 public:
  explicit DataViewBuiltinsFromDSLAssembler(compiler::CodeAssemblerState* state) : DataViewBuiltinsAssembler(state) {}

  using Node = compiler::Node;
  template <class T>
  using TNode = compiler::TNode<T>;
  template <class T>
  using SloppyTNode = compiler::SloppyTNode<T>;

  TNode<String> MakeDataViewGetterNameString(ElementsKind p_kind);
  TNode<String> MakeDataViewSetterNameString(ElementsKind p_kind);
  TNode<BoolT> WasNeutered(TNode<JSArrayBufferView> p_view);
  TNode<JSDataView> ValidateDataView(TNode<Context> p_context, TNode<Object> p_o, TNode<String> p_method);
  TNode<Smi> LoadDataView8(TNode<JSArrayBuffer> p_buffer, TNode<UintPtrT> p_offset, bool p_signed);
  TNode<Number> LoadDataView16(TNode<JSArrayBuffer> p_buffer, TNode<UintPtrT> p_offset, TNode<BoolT> p_requestedLittleEndian, bool p_signed);
  TNode<Number> LoadDataView32(TNode<JSArrayBuffer> p_buffer, TNode<UintPtrT> p_offset, TNode<BoolT> p_requestedLittleEndian, ElementsKind p_kind);
  TNode<Number> LoadDataViewFloat64(TNode<JSArrayBuffer> p_buffer, TNode<UintPtrT> p_offset, TNode<BoolT> p_requestedLittleEndian);
  bool kPositiveBigInt();
  bool kNegativeBigInt();
  int31_t kZeroDigitBigInt();
  int31_t kOneDigitBigInt();
  int31_t kTwoDigitBigInt();
  TNode<BigInt> CreateEmptyBigInt(TNode<BoolT> p_isPositive, int31_t p_length);
  TNode<BigInt> MakeBigIntOn64Bit(TNode<Uint32T> p_lowWord, TNode<Uint32T> p_highWord, bool p_signed);
  TNode<BigInt> MakeBigIntOn32Bit(TNode<Uint32T> p_lowWord, TNode<Uint32T> p_highWord, bool p_signed);
  TNode<BigInt> MakeBigInt(TNode<Uint32T> p_lowWord, TNode<Uint32T> p_highWord, bool p_signed);
  TNode<BigInt> LoadDataViewBigInt(TNode<JSArrayBuffer> p_buffer, TNode<UintPtrT> p_offset, TNode<BoolT> p_requestedLittleEndian, bool p_signed);
  TNode<Numeric> DataViewGet(TNode<Context> p_context, TNode<Object> p_receiver, TNode<Object> p_offset, TNode<Object> p_requestedLittleEndian, ElementsKind p_kind);
  void StoreDataView8(TNode<JSArrayBuffer> p_buffer, TNode<UintPtrT> p_offset, TNode<Uint32T> p_value);
  void StoreDataView16(TNode<JSArrayBuffer> p_buffer, TNode<UintPtrT> p_offset, TNode<Uint32T> p_value, TNode<BoolT> p_requestedLittleEndian);
  void StoreDataView32(TNode<JSArrayBuffer> p_buffer, TNode<UintPtrT> p_offset, TNode<Uint32T> p_value, TNode<BoolT> p_requestedLittleEndian);
  void StoreDataView64(TNode<JSArrayBuffer> p_buffer, TNode<UintPtrT> p_offset, TNode<Uint32T> p_lowWord, TNode<Uint32T> p_highWord, TNode<BoolT> p_requestedLittleEndian);
  void StoreDataViewBigInt(TNode<JSArrayBuffer> p_buffer, TNode<UintPtrT> p_offset, TNode<BigInt> p_bigIntValue, TNode<BoolT> p_requestedLittleEndian);
  TNode<Object> DataViewSet(TNode<Context> p_context, TNode<Object> p_receiver, TNode<Object> p_offset, TNode<Object> p_value, TNode<Object> p_requestedLittleEndian, ElementsKind p_kind);
};

}  // namespace internal
}  // namespace v8

#endif  // V8_TORQUE_DATA_VIEW_FROM_DSL_BASE_H__
